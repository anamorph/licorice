/*
id:				licorice.js
author:		nicolas david - nicolas@nuage.ninja
version: 	1.1

todo:
			status		desc
			--------------------------------------------------------------------------
			PART			generate 2 different photo sizes
				OK				1. web (licorice/social media)
				KO				2. print (for future integration with print API)
									-> next major sprint, target v2.0
			OK 				metadata to dynamodb
			OK	 			dynamic item build for dynamodb
			OK				use environment variables pushed by cloudformation at deployment
								time.
			OK				change sha1 to node-uuid, much quicker.
								-> next major sprint, target v1.1 via
								https://www.npmjs.com/package/node-uuid
			OK				Node 6.10 review/update

			--------------------------------------------------------------------------

console messages:
			id				desc
			--------------------------------------------------------------------------
			WWW				Warning
			EEE				Error
			###				Informative
			--------------------------------------------------------------------------

*/
/*
Environment
This value is for your reference in your deployments to log in traces.
*/
var licorice_env		= process.env.licoriceEnv;

/*
Dependencies
*/
var async						= require('async');
var AWS							= require('aws-sdk');
var gm							= require('gm')
											.subClass({ imageMagick: true }); // w/ imageMagick integration.
var util						= require('util');
// var crypto					= require('crypto');
var uuid 						= require('node-uuid');
var s3 							= new AWS.S3();
var ddb							= new AWS.DynamoDB();
var ddbTable				= process.env.licoriceDynamoDBTableName;
var dstBucket				= process.env.licoriceS3TargetBucketName;
/*
Constants
These values will be used as scaling factor to resize our photos for the web.
*/
var MAX_WIDTH_WEB				= 512;
var MAX_HEIGHT_WEB 			= MAX_WIDTH_WEB;


exports.handler 		= function(event, context) {
/*
Read options from the event.
Object key may have spaces or unicode non-ASCII characters; let's replace that.
*/
console.log("### - Reading options from event:\n", util.inspect(event, {depth: 5}));
var srcBucket 		= event.Records[0].s3.bucket.name;
var srcKey				= decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
var srcOwner			= decodeURIComponent(event.Records[0].userIdentity.principalId.replace(/\+/g, " "));
var srcTimestamp	= decodeURIComponent(event.Records[0].eventTime.replace(/\+/g, " "));
/*
Sanity checks
Validate that source and destination are different buckets.
*/
var imageType 		= srcKey.match(/\.([^.]*)$/)[1];

if (srcBucket == dstBucket) {
	console.error("EEE - Destination bucket MUST not match source bucket.");
	return;
}
/* Since we're only working with jpe?g/JPE?G exports, we're ignoring other assets. */
if (!(imageType.match(/^(jpe?g|JPE?G)$/))) {
	console.log('WWW - skipping non-image ' + srcKey);
	return;
}
/*
Creating a unique key in order to:
	1. Prevent from similar object name in our multi-user environment.
	2. Ensure consistant performance in our s3 bucket (think TPS, Transactions Per Second).

AWS Best practice: Greatest amount of entropy in the most significant bits.

In v1:
	i used sha1 to create a unique key from a concatenation of owner+key+timestamp.

	<old-code>
	var hash					= crypto.createHash('sha1');
	hash.setEncoding('hex');
	hash.write(srcOwner + srcKey + srcTimestamp);
	hash.end();
	var dstKey				= 'licorice-photos/' + hash.read() + '.jpg';
	</old-code>

In v1.1:
	i am now using uuid v4 to generate unique keys, short and sweet.
*/

var dstKey					= 'licorice-photos/' + uuid.v4() + '.' + imageType;


async.waterfall([
	/*
	s3Get:
	------
	grab the image from source s3 bucket, and stream it to the rest of the waterfall.
	*/
	function s3Get(next) {
		s3.getObject({ Bucket: srcBucket, Key: srcKey }, next);
	},
	/*
	imageTransform:
	---------------
	resize the image using preset factors set above.
	*/
	function imageTransform(response, next) {
		var myGm = gm(response.Body);
		myGm.size(function(err, size) {
			/*
			Infer the scaling factor to avoid stretching the image unnaturally.
			*/
			var scalingFactor = Math.min(
				MAX_WIDTH_WEB / size.width,
				MAX_HEIGHT_WEB / size.height
			);
			var width		= scalingFactor * size.width;
			var height	= scalingFactor * size.height;

			/*
			Transform the image buffer in memory.
			*/
			this.resize(width, height)
				.toBuffer(imageType, function(err, buffer) {
					if (err) {
						next(err);
					} else {
						next(null, response.ContentType, buffer, myGm);
					}
				});
		});
	},

	/*
	metadataGet:
	------------
	parsing metadata from image stream to pass on to metadataInsert.
	*/
	function metadataGet(contentType, data, myGm, next) {
		/*
		reminder:
		=========
		EXIF values are formatted as follows:
		%[EXIF:tagname]

		IPTC values are formatted differently:
		%[IPTC:val:ues]

		note: about 2 hours spent finding out about this, only after opening gm's repo ...
		*/
		myGm.identify('%[EXIF:Artist]/%[EXIF:Model]/%[EXIF:ISOSpeedRatings]/%[EXIF:DateTimeOriginal]/%[IPTC:2:120]/%[IPTC:2:5]/%[IPTC:2:101]/%[IPTC:2:90]/%[IPTC:2:25]', function(err, metadataResult, info) {
			if (err) {console.log(err);}
			var metadataResultData = metadataResult.split('/');
			var artist = escape(metadataResultData[0]);
			var camera = escape(metadataResultData[1]);
			var isorating = escape(metadataResultData[2]);
			var year = escape(metadataResultData[3].split(':')[0]);
			var album = escape(metadataResultData[4]);
			var title = escape(metadataResultData[5].replace(/'/g, '&#39;'));
			var country = escape(metadataResultData[6]);
			var city = escape(metadataResultData[7]);
			var people = escape(metadataResultData[8]);
			console.log('### - metadataGet => ' + metadataResult);
			next(err, contentType, data, myGm, artist, camera, isorating, year, album, title, country, city, people, info);
		});
	},
	/*
	metadataInsert:
	---------------
	formatting our JSON dynamodb item, then putItem into dynamodb table ddbTable:
	=> id, artist, album, year, title, country, city, gps coord, people, iso rating, lens, camera.
	we are building the item in json then pushing it to dynamodb.
	*/
	function metadataInsert(contentType, data, myGm, artist, camera, isorating, year, album, title, country, city, people, info, next) {
		var item = {
			'id': { 'S': dstKey },
			'artist': (artist ? { 'S': artist } : { 'S': 'null' }),
			'album': (album ? { 'S': album } : { 'S': 'null' }),
			'year': (year ? { 'S': year } : { 'S': 'null' }),
			'title': (title ? { 'S': title } : { 'S': 'null' }),
			'country': (country ? { 'S': country } : { 'S': 'null' }),
			'city': (city ? { 'S': city } : { 'S': 'null' }),
			'people': (people ? { 'S': people } : { 'S': 'null' }),
			'isorating': (isorating ? { 'S': isorating } : { 'S': 'null' }),
			'camera': (camera ? { 'S': camera } : { 'S': 'null' })
		};
		console.log('### - metadataInsert(ddbTable) => ', item);
		ddb.putItem({
			'TableName': ddbTable,
			'Item': item
		}, function(err, data) {
			// err && console.log(err, item);
			console.log(err, item);
			next(err);
		});
		next(null, contentType, data, info);
	},
	/*
	s3Put:
	------
	stream the transformed image to our destination s3 bucket. The content will then
	be cached by cloudfront to be included in our web front-end upon valid
	credentials supplied by WebIdentity + Cognito.
	*/
	function s3Put(contentType, data, info, next) {
		s3.putObject({
			Bucket: dstBucket,
			Key: dstKey,
			Body: data,
			ContentType: contentType
		},
		next);
		}], function (err) {
			if (err) {
				console.error(
					'EEE - Unable to resize: ' + srcBucket + '/' + srcKey +
					' and upload to: ' + dstBucket + '/' + dstKey +
					' due to an error: ' + err
				);
			} else {
				console.log(
					'### - Successfully resized: ' + srcBucket + '/' + srcKey +
					' and uploaded to: ' + dstBucket + '/' + dstKey + ' as: ' + licorice_env
				);
			}
			context.done();
		}
	);
};
