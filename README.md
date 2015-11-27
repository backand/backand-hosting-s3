# backand-hosting-s3

Sync a local folder to Backand AWS S3 hosting bucket

1. Require

    var gulp = require('gulp');
    var backandSync = require('../sync-module');

2. Set credentials. Credentials will be stored in file `temporary-credentials.json`

    gulp.task('sts', function(){
      var masterToken = "your master backand token";
      var userToken = "your user backand token"; 
      return backandSync.sts(masterToken, userToken);
    });

3. Sync folder `./src`

    gulp.task('dist', function() {   
      var folder = "./src";
      return backandSync.dist(folder);
    });

4. Syncing is done via local cache file `.awspublish-<bucketname>`. Repeated add/delete of the same file may confuse it. To clean the cache do:

    gulp.task('clean', function() {
      return backandSync.clean();
    });