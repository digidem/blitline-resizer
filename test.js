var test = require('tape');
var ngrok = require('ngrok');
var http = require('http');
var knox = require('knox');
var dotenv = require('dotenv');
var request = require('request');
var createImageSizeStream = require('image-size-stream');
var Resizer = require('./');
var bodyParser = require('body-parser').json();

// Try to load env variables from .env
dotenv.load();

var client = knox.createClient({
    key: process.env.S3_KEY,
    secret: process.env.S3_SECRET,
    bucket: process.env.S3_BUCKET
});

var port = 8080;

var timeout = 30000;

var images = ["https://farm6.staticflickr.com/5595/15103964698_67fae4c535_k_d.jpg", "https://farm4.staticflickr.com/3907/14459663821_329233b70e_k_d.jpg"];

var imagesMeta = {};

var server, resizerDefaults, postbackCallback;

function setup() {
    test('Test setup', function(t) {
        server = http.createServer(function(req, res) {
            bodyParser(req, res, function(err) {
                postbackCallback(err, req, res);
            });
        }).listen(port);

        t.equal(typeof Resizer, 'function', 'Resizer exports a function');
        t.throws(Resizer, /must provide an config object/, 'throws if no config');
        t.throws(Resizer.bind(null, {}), /must provide a 'blitlineAppId' option/, 'throws if no blitlineAppId option');

        ngrok.connect(port, function(err, url) {
            t.error(err, 'successfully set up test server');
            resizerDefaults = {
                blitlineAppId: process.env.BLITLINE_APP_ID,
                postbackUrl: url,
                s3Bucket: process.env.S3_BUCKET
            };
            t.end();
        });

    });

    test('Get sizes of input images', function(t) {
        t.plan(images.length);

        images.forEach(function(image) {
            var imageSizeStream = createImageSizeStream();

            imageSizeStream.on('size', function(dimensions) {
                imagesMeta[image] = (dimensions);
                // imageSizeStream.destroy();
                t.pass('got image dimensions for ' + image);
            });

            imageSizeStream.on('error', function(err) {
                t.fail(err);
            });

            request(image).pipe(imageSizeStream);
        });
    });

}

function teardown() {
    test('Cleaup tmp files from s3', function(t) {
        client.list(function(err, data) {
            if (err) return t.end(err);
            var keys = data.Contents.map(function(v) {
                return v.Key;
            });
            client.deleteMultiple(keys, function(err) {
                t.error(err, 'Deleted files from test s3 bucket');
                console.log(keys.join('\n'));
                t.end();
            });
        });
    });

    test('Test teardown', function(t) {
        ngrok.disconnect();
        server.close(function() {
            t.pass('servers disconnected and closed');
            t.end();
        });
    });
}

setup(test);

function checkResizeReponse(t, resizeTask) {
    return function(err, data) {
        t.error(err && data.error, 'successfully sent job to Blitline');
        t.ok(data.results, 'got response with job id from Blitline');
        resizeTask.jobs = data.results.map(function(value) { return value.job_id; });
        t.equal(resizeTask.jobs.length, resizeTask.images.length, 'all jobs submitted');
    };
}

function checkPostback(t, results) {
    t.equal(typeof results, 'object', 'got postback results from Blitline');
    t.error(results.errors, 'Blitline processing complete without errors');
}

test('Resizes a single image', function(t) {
    var resize = Resizer(resizerDefaults);

    var resizeTask = {
        images: [ images[0] ],
        sizes: [500, 1000]
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    t.timeoutAfter(timeout);

    postbackCallback = function(err, req) {
        var results = req.body.results;
        checkPostback(t, results);
        var resultsSizes = results.images.map(function(image) {
            return image.meta.width;
        });
        t.deepEqual(resultsSizes.sort(), resizeTask.sizes.sort(), 'got the correct sizes back');
        t.end();
    };

});

test('Resizes image from raw.github without correct headers', function(t) {
    var resize = Resizer(resizerDefaults);

    var resizeTask = {
        images: [ "https://raw.githubusercontent.com/digidem-test/test/master/assets_other/14782435_9baff664f2_o_d.jpg" ],
        sizes: [500]
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    t.timeoutAfter(timeout);

    postbackCallback = function(err, req) {
        var results = req.body.results;
        checkPostback(t, results);
        var resultsSizes = results.images.map(function(image) {
            return image.meta.width;
        });
        t.deepEqual(resultsSizes.sort(), resizeTask.sizes.sort(), 'got the correct sizes back');
        t.end();
    };

});


test('Resizes multiple images, returning a separate job for each image', function(t) {
    var resize = Resizer(resizerDefaults);

    var resizeTask = {
        images: images,
        sizes: [500]
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    t.timeoutAfter(timeout);

    postbackCallback = function(err, req) {
        var results = req.body.results;
        checkPostback(t, results);

        var jobIndex = resizeTask.jobs.indexOf(results.job_id);
        t.notEqual(jobIndex, -1, 'got results for test job ' + results.job_id);
        resizeTask.jobs.splice(jobIndex, 1);

        if (!resizeTask.jobs.length) {
            t.pass('all jobs returned');
            t.end();
        }
    };
});

test('Creates retina versions', function(t) {
    var resize = Resizer(resizerDefaults),
        s3UrlPrefix = 'http://' + process.env.S3_BUCKET + '.s3.amazonaws.com/';

    var resizeTask = {
        images: [ images[0] ],
        sizes: [400, 1000],
        retina: true
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    t.timeoutAfter(timeout);

    postbackCallback = function(err, req) {
        var results = req.body.results;
        checkPostback(t, results);

        var resultsSizes = results.images.map(function(image) {
            return image.meta.width;
        }).sort();

        var expectedSizes = resizeTask.sizes.concat(resizeTask.sizes.map(function(size) {
            return size * 2;
        })).sort();

        var s3Urls = results.images.map(function(image) {
            return image.s3_url;
        }).sort();

        var expectedUrls = resizeTask.sizes.reduce(function(prev, size) {
            var url = s3UrlPrefix + images[0].split('/').pop().replace('.jpg', '') + '-' + size + '.jpg';
            var retinaUrl = s3UrlPrefix + images[0].split('/').pop().replace('.jpg', '') + '-' + size + '@2x.jpg';
            prev.push(url, retinaUrl);
            return prev;
        }, []).sort();

        t.deepEqual(resultsSizes, expectedSizes, 'got the correct sizes back');
        t.deepEqual(s3Urls, expectedUrls, 'images correctly named on s3');

        t.end();
    };

});

test('Works with custom renamer', function(t) {
    var renamer = function(imageUrl, size) {
      var ext = '.jpg';

      if (size) {
        return 'subfolder/testimage-' + size + ext;
      } else {
        return 'subfolder/testimage' + ext;
      }
    };

    var resize = Resizer(resizerDefaults),
        s3UrlPrefix = 'http://' + process.env.S3_BUCKET + '.s3.amazonaws.com/';

    var resizeTask = {
        images: [ images[0] ],
        sizes: [400],
        retina: true,
        renamer: renamer
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    t.timeoutAfter(timeout);

    postbackCallback = function(err, req) {
        var results = req.body.results;
        checkPostback(t, results);

        var s3Urls = results.images.map(function(image) {
            return image.s3_url;
        }).sort();

        var expectedUrls = [
            s3UrlPrefix + 'subfolder/testimage-400.jpg',
            s3UrlPrefix + 'subfolder/testimage-400@2x.jpg'
        ].sort();

        t.deepEqual(s3Urls, expectedUrls, 'images correctly renamed on s3');

        t.end();
    };
});

test('Copies original to s3', function(t) {
    var resize = Resizer(resizerDefaults);

    var resizeTask = {
        images: [ images[0] ],
        sizes: [500]
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    t.timeoutAfter(timeout);

    postbackCallback = function(err, req) {
        var results = req.body.results;
        checkPostback(t, results);

        var imageSizeStream = createImageSizeStream();

        imageSizeStream.on('size', function(dimensions) {
            // imageSizeStream.destroy();
            t.equal(dimensions.width, imagesMeta[images[0]].width, 'original present on s3');
            t.end();
        });

        imageSizeStream.on('error', function(err) {
            clearTimeout(resizeTask.timer);
            t.end(err);
        });

        var url = 'http://' + process.env.S3_BUCKET + '.s3.amazonaws.com/' + images[0].split('/').pop();

        request(url).pipe(imageSizeStream);
    };
});

test('Sets custom headers on the postback', function(t) {
    var resize = Resizer(resizerDefaults);

    var resizeTask = {
        images: [ images[0] ],
        sizes: [500],
        postbackHeaders: {
            'x-custom-header': 'my custom header'
        }
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    t.timeoutAfter(timeout);

    postbackCallback = function(err, req) {
        var results = req.body.results;
        checkPostback(t, results);
        t.equal(req.headers['x-custom-header'], 'my custom header', 'postback has custom header');
        t.end();
    };
});

test('Long polls for response if no postbackUrl is provided', function(t) {
    var resize = Resizer({
            blitlineAppId: process.env.BLITLINE_APP_ID,
            s3Bucket: process.env.S3_BUCKET
        });

    var resizeTask = {
        images: images,
        sizes: [500, 1000]
    };

    resize(resizeTask, function(err, data) {
        t.error(err, 'longpoll returned without error');
        t.ok(data instanceof Array, 'got an array back');
        t.equal(data.length, resizeTask.images.length, 'got correct number of jobs back');
        t.equal(typeof data[0], 'object', 'got and object back for first job');
        t.error(data[0].results.errors, 'Blitline processing complete without errors');
        t.equal(data[0].results.images.length, resizeTask.sizes.length, 'got correct number of images back');

        t.end();
    });

    postbackCallback = function() {
        t.fail('should not call postback');
    };
});

teardown(test);
