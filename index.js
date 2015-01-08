var Blitline = require('simple_blitline_node');
var blitline = new Blitline();
var validator = require('validator');
var extend = require('xtend');
var url = require('url');
var mime = require('mime-types');
var crypto = require('crypto');
var path = require('path');

var BlitlineResizer = function(config) {
  if (typeof config != 'object')
    throw new TypeError('must provide an config object');

  if (typeof config.blitlineAppId != 'string')
    throw new TypeError('must provide a \'blitlineAppId\' option');

  if (!validator.isURL(config.postbackUrl))
    throw new TypeError('must provide a valid URL for \'postbackUrl\'');

  if (typeof config.s3Bucket != 'string')
    throw new TypeError('must provide a \'s3Bucket\' option');

  function resize(options, callback) {
    if (typeof options != 'object')
      return callback(new TypeError('must provide an options object'));

    if (!(options.images instanceof Array))
      return callback(new TypeError('must provide an array of images'));

    options.images.forEach(function(imageUrl) {
      if (!validator.isURL(imageUrl))
        return callback(new TypeError(imageUrl + ' is not a valid url'));
    });

    if (!(options.sizes instanceof Array))
      return callback(new TypeError('must provide an array of sizes'));

    var renamer = options.renamer || function(imageUrl, size) {
      var pathname = url.parse(imageUrl).pathname;
      var ext = path.extname(pathname);
      var basename = path.basename(pathname, ext);

      if (size) {
        return basename + '-' + size + ext;
      } else {
        return basename + ext;
      }
    };

    var secret = options.secret || crypto.randomBytes(32).toString('base64');

    var headers = {
      "X-Blitline-Signature": secret,
    };

    var jobDefaults = {
      "application_id": config.blitlineAppId,
      "postback_url": config.postbackUrl,
      "retry_postback": false,
      "postback_headers": extend(headers, options.postbackHeaders),
      "v": 1.21
    };

    options.images.forEach(function(imageUrl) {
      var job = {
        "src": imageUrl,
        "functions": [],
        "pre_process": {
          "move_original": {
            "s3_destination": saveJson(renamer(imageUrl)).s3_destination
          }
        }
      };

      options.sizes.forEach(function(size) {
        var filename = renamer(imageUrl, size);
        job.functions = job.functions.concat(resizeJson(filename, size, true));
      });

      blitline.addJob(extend(jobDefaults, job));
    });

    blitline.postJobs(function(err, data) {
      if (!err) data.secret = secret;
      callback(err, data);
    });
  }

  // Creates resize function job parameters for Blitline
  // Returns an array
  // If 'retina' is true returns a second function to 
  // create the image at double resolution.
  function resizeJson(filename, width, retina) {
    var fn = [{
      "name": "resize_to_fit",
      "params": {
        "width": width,
        "only_shrink_larger": true
      },
      "save": saveJson(filename)
    }];

    if (retina) {
      var ext = path.extname(filename);
      filename = path.basename(filename, ext) + '@2x' + ext;

      fn.push({
        "name": "resize_to_fit",
        "params": {
          "width": width * 2,
          "only_shrink_larger": true
        },
        "save": saveJson(filename)
      });
    }

    return fn;
  }

  // Creates AWS S3 job parameters for Blitline
  function saveJson(filename) {
    return {
      "image_identifier": filename,
      "s3_destination": {
        "bucket": config.s3Bucket,
        "key": filename,
        "headers": {
          "Cache-Control": "max-age=31536000, public",
          "Content-type": mime.lookup(filename)
        }
      }
    };
  }

  return resize;
};

module.exports = BlitlineResizer;
