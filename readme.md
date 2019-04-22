Genki-dama
====================

Since I can't transfer my local audio files to Pocketcast directly, I have to provide a server to generate an rss url for Pocketcast to download files.

The server shall be accessed worldwidely because Pocketcast always fetchs rss on their server. If the server is behind proxy server, the proxy server should preserve host to help the rss server generate correct resource urls.

## Usage

```
POST=8000 DIR=__AUDIO_FILES_PATH__ node bin/www
```

## TODO

[ ] Persist uuid mapping
[ ] Random podcast title to prevent from being searched in Pocketcast
