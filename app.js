const express = require('express');
const path = require('path')
const fs = require('fs')
const etpl = require('etpl')
const util = require('util')
const url = require('url')
const uuid = require('uuid/v4')
const {sortBy, flatten, find, deburr, capitalize} = require('lodash')
const pinyin = require("pinyin");

const rssRender = etpl.compile(fs.readFileSync(path.resolve(__dirname, 'views/rss.etpl'), 'utf8'))
const FILE_DIR = process.env.DIR || process.env.PWD
const {HOST, PORT, EXTERNAL_PORT} = process.env

const allowedFileExtensions = ['mp3', 'mp4', 'm4a']

let podcastFiles = []
updatePodcastFiles().then(function () {
  console.log('Ready')
}).catch(function (err) {
  console.log('Scanning dictionary fail: ', err.message)
})

fs.watch(FILE_DIR, function (eventType, filename) {
  updatePodcastFiles().then(function () {
    console.log('Reload dictionary')
  }).catch(function (err) {
    console.log('Reload dictionary fail: ', err.message)
  })
})

async function updatePodcastFiles() {
  let nowTimestamp = Date.now()
  let files = await util.promisify(fs.readdir)(FILE_DIR)
  files = files.filter(file => allowedFileExtensions.includes(path.extname(file).substring(1)))
  podcastFiles = files.map(function (file, index) {
    let id = uuid()
    let title = file.substring(0, file.lastIndexOf('.'))
    title = getPinyin(title) // GFW! You know it.
    return {
      id,
      title,
      mimeType: `audio/${path.extname(file).substring(1)}`,
      pubData: (new Date(nowTimestamp + index * 1e3)).toUTCString(),
      description: title,
      file
    }
  })
}

function getPinyin(str) {
  return flatten(pinyin(str.replace(/\s+/g, '_')))
          .map(item => capitalize(deburr(item))).join('')
}


const app = express();
module.exports = app;

app.set('trust proxy', true)

app.get('/rss', async function (req, res) {
  let title = 'Local podcast feed'
  let urlPrefix = `${req.protocol}://${req.headers.host}`
  let content = rssRender({
    title,
    items: podcastFiles,
    urlPrefix
  })

  res.type('.xml').send(content)
})

app.get('/rss/episode/:uuid', function (req, res) {
  let {uuid} = req.params
  uuid = uuid.trim()
  let {file} = find(podcastFiles, function ({id}) {
    return id === uuid
  }) || {}
  if (!file) {
    res.sendStatus(404)
    return
  }
  res.sendFile(path.join(FILE_DIR, file))
})

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  let err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.send(err);
});
