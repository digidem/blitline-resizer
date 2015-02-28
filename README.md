[![Build Status](https://travis-ci.org/digidem/blitline-resizer.svg)](https://travis-ci.org/digidem/blitline-resizer)

Blitline Image Resizer
======================

Resizes images using [Blitline](https://www.blitline.com/). Takes an array of image urls and an array of sizes and will copy all resized images to an Amazon S3 bucket. Right now sizes are for fit to width. Images need to be online and publicly accessible.

## Why?

Created for resizing images for use on responsive websites, hence for now only fits width.

## Usage

1. [Create a Blitline account](https://www.blitline.com/signup) and get a valid Application Id (a developer account is free).

2. [Set up permissions](https://www.blitline.com/docs/s3_permissions) on an Amazon S3 bucket so that Blitline can put the results there.

3. You will need a server that can receive and process the [postback](https://www.blitline.com/docs/postback) (think webhook) that Blitline posts to when image processing is complete.

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

Needs a config file `./test_config.json`:

```json
{
    "blitline_app_id": "YOUR_BLITLINE_APP_ID",
    "s3_bucket": "TEST_AMAZON_S3_BUCKET_NAME"
}
```

`npm test`

## Todo

- [x] Better test coverage
- [ ] Support [polling](https://www.blitline.com/docs/polling) to avoid needing postback server
- [ ] Allow resizing to fit both height and width

## Changelog

### v0.1.0

Add `options.retina` to also create retina versions of images. Defaults to false. **NB. Breaking change** previously it created retina versions by default.
