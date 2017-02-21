var videoCommon = require("./videoplayer-common");
var utils = require("utils/utils");
var timer = require("timer");
global.moduleMerge(videoCommon, exports);
function onVideoSourcePropertyChanged(data) {
    var video = data.object;
    if (!video.android) {
        return;
    }
    video._setNativeVideo(data.newValue ? data.newValue.android : null);
}
videoCommon.Video.videoSourceProperty.metadata.onSetNativeValue = onVideoSourcePropertyChanged;
var STATE_IDLE = 0;
var STATE_PLAYING = 1;
var STATE_PAUSED = 2;
var SURFACE_WAITING = 0;
var SURFACE_READY = 1;
var Video = (function (_super) {
    __extends(Video, _super);
    function Video() {
        _super.call(this);
        this._android = null;
        this.videoWidth = 0;
        this.videoHeight = 0;
        this._src = null;
        this.playState = STATE_IDLE;
        this.mediaState = SURFACE_WAITING;
        this.textureSurface = null;
        this.mediaPlayer = null;
        this.audioSession = null;
        this.mediaController = null;
        this.preSeekTime = -1;
        this.currentBufferPercentage = 0;
    }
    Object.defineProperty(Video.prototype, "android", {
        get: function () {
            return this._android;
        },
        enumerable: true,
        configurable: true
    });
    Video.prototype._createUI = function () {
        var that = new WeakRef(this);
        this._android = new android.view.TextureView(this._context);
        this._android.setFocusable(true);
        this._android.setFocusableInTouchMode(true);
        this._android.requestFocus();
        this._android.setOnTouchListener(new android.view.View.OnTouchListener({
            get owner() {
                return that.get();
            },
            onTouch: function () {
                this.owner.toggleMediaControllerVisibility();
                return false;
            }
        }));
        this._android.setSurfaceTextureListener(new android.view.TextureView.SurfaceTextureListener({
            get owner() {
                return that.get();
            },
            onSurfaceTextureSizeChanged: function (surface, width, height) {
                console.log("SurfaceTexutureSizeChange", width, height);
            },
            onSurfaceTextureAvailable: function (surface) {
                this.owner.textureSurface = new android.view.Surface(surface);
                this.owner.mediaState = SURFACE_WAITING;
                this.owner._openVideo();
            },
            onSurfaceTextureDestroyed: function () {
                if (this.owner.textureSurface !== null) {
                    this.owner.textureSurface.release();
                    this.owner.textureSurface = null;
                }
                if (this.owner.mediaController !== null) {
                    this.owner.mediaController.hide();
                }
                this.owner.release();
                return true;
            },
            onSurfaceTextureUpdated: function () {
            }
        }));
    };
    Video.prototype.toggleMediaControllerVisibility = function () {
        if (!this.mediaController) {
            return;
        }
        if (this.mediaController.isShowing()) {
            this.mediaController.hide();
        }
        else {
            this.mediaController.show();
        }
    };
    Video.prototype._setupMediaPlayerListeners = function () {
        var that = new WeakRef(this);
        this.mediaPlayer.setOnPreparedListener(new android.media.MediaPlayer.OnPreparedListener({
            get owner() {
                return that.get();
            },
            onPrepared: function (mp) {
                if (this.owner) {
                    if (this.owner.muted === true) {
                        mp.setVolume(0, 0);
                    }
                    if (this.owner.mediaController != null) {
                        this.owner.mediaController.setEnabled(true);
                    }
                    if (this.owner.preSeekTime > 0) {
                        mp.seekTo(this.owner.preSeekTime);
                    }
                    this.owner.preSeekTime = -1;
                    this.owner.videoWidth = mp.getVideoWidth();
                    this.owner.videoHeight = mp.getVideoHeight();
                    this.owner.mediaState = SURFACE_READY;
                    if (this.owner.fill !== true) {
                        this.owner._setupAspectRatio();
                    }
                    if (this.owner.videoWidth !== 0 && this.owner.videoHeight !== 0) {
                        this.owner.android.getSurfaceTexture().setDefaultBufferSize(this.owner.videoWidth, this.owner.videoHeight);
                    }
                    if (this.owner.autoplay === true || this.owner.playState === STATE_PLAYING) {
                        this.owner.play();
                    }
                    if (this.owner.observeCurrentTime && !this.owner._playbackTimeObserverActive) {
                        this.owner._addPlaybackTimeObserver();
                    }
                    this.owner._emit(videoCommon.Video.playbackReadyEvent);
                    if (this.owner.loop === true) {
                        mp.setLooping(true);
                    }
                }
            }
        }));
        this.mediaPlayer.setOnSeekCompleteListener(new android.media.MediaPlayer.OnSeekCompleteListener({
            get owner() {
                return that.get();
            },
            onSeekComplete: function () {
                if (this.owner) {
                    this.owner._emit(videoCommon.Video.seekToTimeCompleteEvent);
                }
            }
        }));
        this.mediaPlayer.setOnVideoSizeChangedListener(new android.media.MediaPlayer.OnVideoSizeChangedListener({
            get owner() {
                return that.get();
            },
            onVideoSizeChanged: function (mediaPlayer) {
                if (this.owner) {
                    this.owner.videoWidth = mediaPlayer.getVideoWidth();
                    this.owner.videoHeight = mediaPlayer.getVideoHeight();
                    if (this.owner.videoWidth !== 0 && this.owner.videoHeight !== 0) {
                        this.owner._android.getSurfaceTexture().setDefaultBufferSize(this.owner.videoWidth, this.owner.videoHeight);
                        if (this.owner.fill !== true) {
                            this.owner._setupAspectRatio();
                        }
                    }
                }
            }
        }));
        this.mediaPlayer.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener({
            get owner() {
                return that.get();
            },
            onCompletion: function () {
                if (this.owner) {
                    this.owner._emit(videoCommon.Video.finishedEvent);
                }
            }
        }));
        this.mediaPlayer.setOnBufferingUpdateListener(new android.media.MediaPlayer.OnBufferingUpdateListener({
            get owner() {
                return that.get();
            },
            onBufferingUpdate: function (mediaPlayer, percent) {
                this.owner.currentBufferPercentage = percent;
            }
        }));
        this.currentBufferPercentage = 0;
    };
    Video.prototype._setupMediaController = function () {
        var that = new WeakRef(this);
        if (this.controls !== false || this.controls === undefined) {
            if (this.mediaController == null) {
                this.mediaController = new android.widget.MediaController(this._context);
            }
            else {
                return;
            }
            var mediaPlayerControl = new android.widget.MediaController.MediaPlayerControl({
                get owner() {
                    return that.get();
                },
                canPause: function () {
                    return true;
                },
                canSeekBackward: function () {
                    return true;
                },
                canSeekForward: function () {
                    return true;
                },
                getAudioSessionId: function () {
                    return this.owner.audioSession;
                },
                getBufferPercentage: function () {
                    return this.owner.currentBufferPercentage;
                },
                getCurrentPosition: function () {
                    return this.owner.getCurrentTime();
                },
                getDuration: function () {
                    return this.owner.getDuration();
                },
                isPlaying: function () {
                    return this.owner.isPlaying();
                },
                pause: function () {
                    this.owner.pause();
                },
                seekTo: function (v) {
                    this.owner.seekToTime(v);
                },
                start: function () {
                    this.owner.play();
                }
            });
            this.mediaController.setMediaPlayer(mediaPlayerControl);
            this.mediaController.setAnchorView(this._android);
            this.mediaController.setEnabled(true);
        }
    };
    Video.prototype._setupAspectRatio = function () {
        var viewWidth = this._android.getWidth();
        var viewHeight = this._android.getHeight();
        var aspectRatio = this.videoHeight / this.videoWidth;
        var newWidth;
        var newHeight;
        if (viewHeight > (viewWidth * aspectRatio)) {
            newWidth = viewWidth;
            newHeight = (viewWidth * aspectRatio);
        }
        else {
            newWidth = (viewHeight / aspectRatio);
            newHeight = viewHeight;
        }
        var xoff = (viewWidth - newWidth) / 2;
        var yoff = (viewHeight - newHeight) / 2;
        var txform = new android.graphics.Matrix();
        this._android.getTransform(txform);
        txform.setScale(newWidth / viewWidth, newHeight / viewHeight);
        txform.postTranslate(xoff, yoff);
        this._android.setTransform(txform);
    };
    Video.prototype._openVideo = function () {
        if (this._src === null || this.textureSurface === null) {
            return;
        }
        console.log("Openvideo", this._src);
        this.release();
        var am = utils.ad.getApplicationContext().getSystemService(android.content.Context.AUDIO_SERVICE);
        am.requestAudioFocus(null, android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.AUDIOFOCUS_GAIN);
        try {
            this.mediaPlayer = new android.media.MediaPlayer();
            if (this.audioSession !== null) {
                this.mediaPlayer.setAudioSessionId(this.audioSession);
            }
            else {
                this.audioSession = this.mediaPlayer.getAudioSessionId();
            }
            this._setupMediaPlayerListeners();
            this.mediaPlayer.setDataSource(this._src);
            this.mediaPlayer.setSurface(this.textureSurface);
            this.mediaPlayer.setAudioStreamType(android.media.AudioManager.STREAM_MUSIC);
            this.mediaPlayer.setScreenOnWhilePlaying(true);
            this.mediaPlayer.prepareAsync();
            this._setupMediaController();
        }
        catch (ex) {
            console.log("Error:", ex, ex.stack);
        }
    };
    Video.prototype._setNativeVideo = function (nativeVideo) {
        this._src = nativeVideo;
        this._openVideo();
    };
    Video.prototype.setNativeSource = function (nativePlayerSrc) {
        this._src = nativePlayerSrc;
        this._openVideo();
    };
    Video.prototype.play = function () {
        this.playState = STATE_PLAYING;
        if (this.mediaState === SURFACE_WAITING) {
            this._openVideo();
        }
        else {
            this.mediaPlayer.start();
        }
    };
    Video.prototype.pause = function () {
        this.playState = STATE_PAUSED;
        this.mediaPlayer.pause();
    };
    Video.prototype.mute = function (mute) {
        if (this.mediaPlayer) {
            if (mute === true) {
                this.mediaPlayer.setVolume(0, 0);
            }
            else if (mute === false) {
                this.mediaPlayer.setVolume(1, 1);
            }
        }
    };
    Video.prototype.stop = function () {
        this.mediaPlayer.stop();
        this.playState = STATE_IDLE;
        this.release();
    };
    Video.prototype.seekToTime = function (ms) {
        if (!this.mediaPlayer) {
            this.preSeekTime = ms;
            return;
        }
        else {
            this.preSeekTime = -1;
        }
        this.mediaPlayer.seekTo(ms);
    };
    Video.prototype.isPlaying = function () {
        if (!this.mediaPlayer) {
            return false;
        }
        return this.mediaPlayer.isPlaying();
    };
    Video.prototype.getDuration = function () {
        if (!this.mediaPlayer || this.mediaState === SURFACE_WAITING || this.playState === STATE_IDLE) {
            return 0;
        }
        return this.mediaPlayer.getDuration();
    };
    Video.prototype.getCurrentTime = function () {
        if (!this.mediaPlayer) {
            return 0;
        }
        return this.mediaPlayer.getCurrentPosition();
    };
    Video.prototype.setVolume = function (volume) {
        this.mediaPlayer.setVolume(volume, volume);
    };
    Video.prototype.destroy = function () {
        this.release();
        this.src = null;
        this._android = null;
        this.mediaPlayer = null;
        this.mediaController = null;
    };
    Video.prototype.release = function () {
        if (this.mediaPlayer !== null) {
            this.mediaState = SURFACE_WAITING;
            this.mediaPlayer.reset();
            this.mediaPlayer.release();
            this.mediaPlayer = null;
            if (this._playbackTimeObserverActive) {
                this._removePlaybackTimeObserver();
            }
            var am = utils.ad.getApplicationContext().getSystemService(android.content.Context.AUDIO_SERVICE);
            am.abandonAudioFocus(null);
        }
    };
    Video.prototype.suspendEvent = function () {
        this.release();
    };
    Video.prototype.resumeEvent = function () {
        this._openVideo();
    };
    Video.prototype._addPlaybackTimeObserver = function () {
        var _this = this;
        this._playbackTimeObserverActive = true;
        this._playbackTimeObserver = timer.setInterval(function () {
            if (_this.mediaPlayer.isPlaying) {
                var _milliseconds = _this.mediaPlayer.getCurrentPosition();
                _this._setValue(Video.currentTimeProperty, _milliseconds);
                _this._emit(videoCommon.Video.currentTimeUpdatedEvent);
            }
        }, 500);
    };
    Video.prototype._removePlaybackTimeObserver = function () {
        timer.clearInterval(this._playbackTimeObserver);
        this._playbackTimeObserverActive = false;
    };
    return Video;
}(videoCommon.Video));
exports.Video = Video;
//# sourceMappingURL=videoplayer.android.js.map