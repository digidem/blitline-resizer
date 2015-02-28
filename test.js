var test = require('tape');
var ngrok = require('ngrok');
var http = require('http');
var knox = require('knox');
var dotenv = require('dotenv');
var request = require('request');
var _ = require('lodash');
var createImageSizeStream = require('image-size-stream');
var Resizer = require('./');
var bodyParser = require('body-parser').json();
var config;

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

var s3files = [];

var server, resizerDefaults, postbackUrl, postbackCallback;

function setup(t) {
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

function teardown(cb) {
    test('Cleaup tmp files from s3', function(t) {
        s3files = _.uniq(s3files).concat(images);

        t.plan(s3files.length);

        s3files.forEach(function(file) {
            file = file.split('/').pop();
            client.deleteFile(file, function(err, res) {
                t.error(err, 'deleted file ' + file);
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

    // store s3_url so we can delete later
    results.images.forEach(function(image) {
        s3files.push(image.s3_url);
    });
}

function createTimeout(t) {
    return setTimeout(function() {
        t.fail('Timeout waiting for blitline to process jobs');
        t.end();
    }, timeout);
}

test('Resizes a single image', function(t) {
    var resize = Resizer(resizerDefaults),
        timer;

    var resizeTask = {
        images: [ images[0] ],
        sizes: [500, 1000]
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    resizeTask.timer = createTimeout(t);

    postbackCallback = function(err, req, res) {
        var results = req.body.results;
        checkPostback(t, results);
        var resultsSizes = results.images.map(function(image) {
            return image.meta.width;
        });
        t.deepEqual(resultsSizes.sort(), resizeTask.sizes.sort(), 'got the correct sizes back');
        clearTimeout(resizeTask.timer);
        t.end();
    };

});

test('Resizes multiple images, returning a separate job for each image', function(t) {
    var resize = Resizer(resizerDefaults),
        timer;

    var resizeTask = {
        images: images,
        sizes: [500]
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    resizeTask.timer = createTimeout(t);

    postbackCallback = function(err, req, res) {
        var results = req.body.results;
        checkPostback(t, results);

        var jobIndex = resizeTask.jobs.indexOf(results.job_id);
        t.notEqual(jobIndex, -1, 'got results for test job ' + results.job_id);
        resizeTask.jobs.splice(jobIndex, 1);

        if (!resizeTask.jobs.length) {
            t.pass('all jobs returned');
            clearTimeout(resizeTask.timer);
            t.end();
        }
    };
});

test('Creates retina versions', function(t) {
    var resize = Resizer(resizerDefaults),
        timer;

    var resizeTask = {
        images: [ images[0] ],
        sizes: [400, 1000],
        retina: true
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    resizeTask.timer = createTimeout(t);

    postbackCallback = function(err, req, res) {
        var results = req.body.results;
        checkPostback(t, results);

        var resultsSizes = results.images.map(function(image) {
            return image.meta.width;
        }).sort();

        var expectedSizes = resizeTask.sizes.concat(resizeTask.sizes.map(function(size) {
            return size * 2;
        })).sort();

        t.deepEqual(resultsSizes, expectedSizes, 'got the correct sizes back');

        clearTimeout(resizeTask.timer);
        t.end();
    };

});

test('Copies original to s3', function(t) {
    var resize = Resizer(resizerDefaults),
        timer;

    var resizeTask = {
        images: [ images[0] ],
        sizes: [500]
    };

    resize(resizeTask, checkResizeReponse(t, resizeTask));

    resizeTask.timer = createTimeout(t);

    postbackCallback = function(err, req, res) {
        var results = req.body.results;
        checkPostback(t, results);

        var imageSizeStream = createImageSizeStream();

        imageSizeStream.on('size', function(dimensions) {
            // imageSizeStream.destroy();
            t.equal(dimensions.width, imagesMeta[images[0]].width, 'original present on s3');
            clearTimeout(resizeTask.timer);
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

test('Long polls for response if no postbackUrl is provided', function(t) {
    var resize = Resizer({
            blitlineAppId: process.env.BLITLINE_APP_ID,
            s3Bucket: process.env.S3_BUCKET
        }),
        timer;

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

    postbackCallback = function(err, req, res) {
        t.fail('should not call postback');
    };
});

teardown(test);
