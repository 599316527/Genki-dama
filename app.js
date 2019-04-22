const express = require('express');
const path = require('path')
const fse = require('fs-extra')
const etpl = require('etpl')
const {promisify} = require('util')
const url = require('url')
const uuid = require('uuid/v4')
const {sortBy, flatten, find, deburr, capitalize, findIndex} = require('lodash')
const pinyin = require("pinyin");

const executeP = promisify(require('child_process').exec);
const ffmpegDurationPattern = /\bDuration:\s+(\d{2}(?::\d{2}){2})\.\d{2}\b/

const rssRender = etpl.compile(fse.readFileSync(path.resolve(__dirname, 'views/rss.etpl'), 'utf8'))
const FILE_DIR = process.env.DIR || process.env.PWD
const {HOST, PORT, EXTERNAL_PORT} = process.env
const podcastsInfoJsonFilePath = path.join(FILE_DIR, '.podcasts.json')
const allowedFileExtensions = ['mp3', 'mp4', 'm4a']

let podcastFiles = []
updatePodcastFiles().then(function () {
  console.log('Ready')
}).catch(function (err) {
  console.log('Scanning dictionary fail: ', err.message)
})

fse.watch(FILE_DIR, function (eventType, filename) {
  if (filename.startsWith('.')) {
    return
  }
  updatePodcastFiles().then(function () {
    console.log('Reload dictionary')
  }).catch(function (err) {
    console.log('Reload dictionary fail: ', err.message)
  })
})

async function updatePodcastFiles() {
  let nowTimestamp = Date.now()
  let persistedPodcastFiles = (await fse.pathExists(podcastsInfoJsonFilePath))
                                ? await fse.readJSON(podcastsInfoJsonFilePath) : []

  let files = await fse.readdir(FILE_DIR)
  files = files.filter(file => allowedFileExtensions.includes(path.extname(file).substring(1)))

  podcastFiles = await Promise.all(files.map(async function (file, index) {
    file = path.join(FILE_DIR, file)
    let matchedFile = find(persistedPodcastFiles, function (pfile) {
      return pfile.file === file
    })
    if (matchedFile) {
      return matchedFile
    }

    let id = uuid()
    let extname = path.extname(file)
    let title = path.basename(file)
    title = getPinyin(path.basename(title, extname)) // GFW! You know it.

    let duration = await getDuration(file)

    return {
      id,
      title,
      mimeType: `audio/${path.extname(file).substring(1)}`,
      pubData: (new Date(nowTimestamp + index * 1e3)).toUTCString(),
      description: title,
      file,
      duration,
      extname
    }
  }))

  await fse.writeJSON(podcastsInfoJsonFilePath, podcastFiles)
}

function getPinyin(str) {
  return flatten(pinyin(str.replace(/\s+/g, '_')))
          .map(item => capitalize(deburr(item))).join('')
}


async function getDuration(file) {
  let {stderr} = await executeP(`ffprobe -i "${file}"`)
  let matched = stderr.match(ffmpegDurationPattern)
  if (!matched) {
    return '0'
  }
  return matched[1]
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
  uuid = path.basename(uuid, path.extname(uuid))
  let {file} = find(podcastFiles, function ({id}) {
    return id === uuid
  }) || {}
  if (!file) {
    res.sendStatus(404)
    return
  }
  res.sendFile(file)
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
