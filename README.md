# licorice
A minimal, clean photo gallery for the cloud
## 1. the pitch
  As an avid photographer, I have a rather spontaneous tendency to share my
  photos with relatives & friends so they will get some idea of the what/when/where
  of my whereabouts; eventually satisfying their thirst for possible destination in
  their upcoming vacation.

  I wanted to use something already existing, yet, in most cases, the price to
  pay for that freedom is usually hurting on many levels:

    1. the real cost of the service (maintenance, downtime, availability, etc.)
    2. the actual limitations of the service, including API documentation.
    3. the open-ness of the service

  Given these few, yet impacting variables, I decided to make my own. I started
  this project eating [rotella](http://davini.co/candy_rotella "rotella"). So
  there it was: _licorice_.

  One last yet considerably important point: _licorice_ should cost as little as
  possible to run. My target is to be able to run _licorice_ for a year out of
  the free tier of my personal AWS account (excluding the domain name price) and
  to be installable in a few clicks (with a little help from AWS CloudFormation).

## 2. what's it using ?
  First things first, a diagram:

  ![licorice](licorice.png "licorice")

  All of _licorice_ relies on the following technologies and services:

    licorice
    ---
      AWS CloudFormation

    licorice-lambda-node:
    ---
      AWS Lambda (NodeJs + async/aws-sdk/gm/crypto)
      Amazon DynamoDB
      Amazon Simple Storage Service (s3)

    licorice-web-template
    ---
      Amazon CloudFront
      Amazon Route 53
      AWS Identity & Access Management Roles
      Amazon Cognito

  and works very well with Adobe Lightroom, which i use both on pc and mac.

  Actually, this is not my first attempt to work with Lightroom and the cloud:
  [lightroom sync with s3 windows macos](https://nuage.ninja/lightroom-sync-with-s3-windows-macos/index.html "lightroom sync with s3 windows macos")

## 3. what will be in this repo ?
  I'm polishing licorice so to release it; patience my friend !

  So far, here's the release structure:

    /
    README.md                   # this file
    licorice-assets             # cfn assets
    licorice-lambda-node        # licorice lambda code in node.js + modules (ready for lambda)
    licorice.png                # this lovely diagram above, much nicer than my ascii skills
