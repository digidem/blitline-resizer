var test = require('tape');
var ngrok = require('ngrok');
var http = require('http');
var Resizer = require('./');
var bodyParser = require('body-parser').json();
var config;

try {
    config = require('./test_config.json');
} catch(e) {
    config = {
        "blitline_app_id": process.env.BLITLINE_APP_ID,
        "s3_bucket": process.env.S3_BUCKET
    };
}

var port = 8080;

var server, resize, postbackUrl, postbackCallback;

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
        t.throws(Resizer.bind(null, { blitlineAppId: 'dummy' }), /must provide a valid URL for 'postbackUrl'/, 'throws if no valid postbackUrl');

        ngrok.connect(port, function(err, url) {
            t.error(err, 'successfully set up test server');
            postbackUrl = url;
            t.end();
        });
    });
}

function teardown(cb) {
    test('Test teardown', function(t) {
        ngrok.disconnect();
        server.close(function() {
            t.pass('servers disconnected and closed');
            t.end();
        });
    });
}

setup(test);

test('Resizes a single image', function(t) {
    var resize = Resizer({
            blitlineAppId: config.blitline_app_id,
            postbackUrl: postbackUrl,
            s3Bucket: config.s3_bucket
        }),
        jobs;

    t.plan(6);

    resize({
        images: ["https://farm6.staticflickr.com/5595/15103964698_67fae4c535_k_d.jpg"],
        sizes: [500]
    }, function(err, data) {
        t.error(err && data.error, 'successfully sent job to Blitline');
        t.ok(data.results, 'got response from Blitline');
        jobs = data.results.map(function(value) { return value.job_id; });
    });

    postbackCallback = function(err, req, res) {
        var results = req.body.results;
        t.equal(typeof results, 'object', 'got postback results from Blitline');
        t.error(results.errors, 'Blitline processing complete without errors');
        t.notEqual(jobs.indexOf(results.job_id), -1, 'got results for test job');
        // The resizer also copies the original to the destination
        t.equal(results.images.length, 2, 'got the correct number of images back');
    };
});

test('Resizes a multiple images', function(t) {
    var resize = Resizer({
            blitlineAppId: config.blitline_app_id,
            postbackUrl: postbackUrl,
            s3Bucket: config.s3_bucket
        }),
        jobs;

    t.plan(10);

    resize({
        images: ["https://farm6.staticflickr.com/5595/15103964698_67fae4c535_k_d.jpg", "https://farm4.staticflickr.com/3907/14459663821_329233b70e_k_d.jpg"],
        sizes: [500]
    }, function(err, data) {
        t.error(err && data.error, 'successfully sent job to Blitline');
        t.ok(data.results, 'got response from Blitline');
        jobs = data.results.map(function(value) { return value.job_id; });
    });

    postbackCallback = function(err, req, res) {
        var results = req.body.results;
        t.equal(typeof results, 'object', 'got postback results from Blitline');
        t.error(results.errors, 'Blitline processing complete without errors');
        t.notEqual(jobs.indexOf(results.job_id), -1, 'got results for test job ' + results.job_id);
        // The resizer also copies the original to the destination
        t.equal(results.images.length, 2, 'got the correct number of images back for job ' + results.job_id);
    };
});

teardown(test);
