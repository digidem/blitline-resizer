[![Build Status](https://travis-ci.org/digidem/blitline-resizer.svg)](https://travis-ci.org/digidem/blitline-resizer)

Blitline Image Resizer
======================

Resizes images using [Blitline](https://www.blitline.com/). Takes an array of image urls and an array of sizes and will copy all resized images to an Amazon S3 bucket. Right now sizes are for fit to width. Images need to be online and publicly accessible.

## Why?

Created for resizing images for use on responsive websites, hence for now only fits width.

## Usage

1. [Create a Blitline account](https://www.blitline.com/signup) and get a valid Application Id (a developer account is free).

2. [Set up permissions](https://www.blitline.com/docs/s3_permissions) on an Amazon S3 bucket so that Blitline can put the results there.

3. If you submit a postbackUrl you will need a server that can receive and process the [postback](https://www.blitline.com/docs/postback) (think webhook) that Blitline posts to when image processing is complete.

If you set `options.postbackUrl` then `resize()` will return an array of hashes with job_id according to https://www.blitline.com/docs/api#returnData - one job for each image you submit.

If you do not set `options.postbackUrl` then it should return an array of results for each image as described http://www.blitline.com/docs/postback - this is not guaranteed though, the request can timeout. Using a postbackUrl is more reliable.

```javascript
var config = {
    blitlineAppId: 'YOUR_BLITLINE_APP_ID',
    postbackUrl: 'http://valid.url/to/receive/postback',
    s3Bucket: 'AMAZON_S3_BUCKET_NAME'
}

var resize = require('blitline-resizer')(config);

var options = {
    images: [ 'array', 'of', 'valid', 'image', 'urls'],
    sizes: [ 100, 200 ] // array of widths to resize to
}

resize(options, function(err, response) {
    console.log(response);
    // responds with a hash or results with job_ids see https://www.blitline.com/docs/api
}
```

## Tests

Needs the following environment variables set:

```sh
BLITLINE_APP_ID=_your blitline app id_
S3_KEY=_s3 key ID for test user_
S3_SECRET=_s3 secret key for test user_
S3_BUCKET=_test s3 bucket_ # NB. Blitline should have PutObject permissions, your S3 test user should have DeleteObject permissions
```

`npm test`

## Todo

- [x] Better test coverage
- [x] Support [polling](https://www.blitline.com/docs/polling) to avoid needing postback server
- [ ] Allow resizing to fit both height and width

## Changelog

### v0.2.0

Support for long polling without a postback

### v0.1.0

Add `options.retina` to also create retina versions of images. Defaults to false. **NB. Breaking change** previously it created retina versions by default.
