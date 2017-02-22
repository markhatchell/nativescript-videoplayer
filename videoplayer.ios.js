var common = require("./videoplayer-common");
var application = require('application');
var timer = require("timer");
global.moduleMerge(common, exports);
function onVideoSourcePropertyChanged(data) {
    var video = data.object;
    video._setNativeVideo(data.newValue ? data.newValue.ios : null);
}
common.Video.videoSourceProperty.metadata.onSetNativeValue = onVideoSourcePropertyChanged;
var Video = (function (_super) {
    __extends(Video, _super);
    function Video() {
        _super.call(this);
        this._playerController = new AVPlayerViewController();
        this._player = new AVPlayer();
        this._playerController.player = this._player;
        this._playerController.showsPlaybackControls = false;
        this._ios = this._playerController.view;
        this._observer = PlayerObserverClass.alloc();
        this._observer["_owner"] = this;
    }
    Object.defineProperty(Video.prototype, "ios", {
        get: function () {
            return this._ios;
        },
        enumerable: true,
        configurable: true
    });
    Video.prototype._setNativeVideo = function (nativeVideoPlayer) {
        if (nativeVideoPlayer != null) {
            var currentItem = this._player.currentItem;
            this._addStatusObserver(nativeVideoPlayer);
            this._autoplayCheck();
            if (currentItem !== null) {
                this._videoLoaded = false;
                this._videoPlaying = false;
                this._player.replaceCurrentItemWithPlayerItem(null);
                this._removeStatusObserver(currentItem);
                this._player.replaceCurrentItemWithPlayerItem(nativeVideoPlayer);
            }
            else {
                this._player.replaceCurrentItemWithPlayerItem(nativeVideoPlayer);
                this._init();
            }
        }
    };
    Video.prototype.updateAsset = function (nativeVideoAsset) {
        var newPlayerItem = AVPlayerItem.playerItemWithAsset(nativeVideoAsset);
        this._setNativeVideo(newPlayerItem);
    };
    Video.prototype._setNativePlayerSource = function (nativePlayerSrc) {
        this._src = nativePlayerSrc;
        var url = NSURL.URLWithString(this._src);
        this._player = new AVPlayer(url);
        this._init();
    };
    Video.prototype._init = function () {
        var self = this;
        if (!this._playbackStartEventListenerActive) {
            this._addPlaybackStartEventListener();
        }
        if (this.controls !== false) {
            this._playerController.showsPlaybackControls = true;
        }
        this._playerController.player = this._player;
        if (isNaN(this.width) || isNaN(this.height)) {
            this.requestLayout();
        }
        if (this.muted === true) {
            this._player.muted = true;
        }
        if (!this._didPlayToEndTimeActive) {
            this._didPlayToEndTimeObserver = application.ios.addNotificationObserver(AVPlayerItemDidPlayToEndTimeNotification, this.AVPlayerItemDidPlayToEndTimeNotification.bind(this));
            this._didPlayToEndTimeActive = true;
        }
    };
    Video.prototype.AVPlayerItemDidPlayToEndTimeNotification = function (notification) {
        if (this._player.currentItem && this._player.currentItem === notification.object) {
            this._emit(common.Video.finishedEvent);
            if (this.loop === true && this._player !== null) {
                this.seekToTime(CMTimeMake(5, 100));
                this.play();
            }
        }
    };
    Video.prototype.play = function () {
        if (this.observeCurrentTime && !this._playbackTimeObserverActive) {
            this._addPlaybackTimeObserver();
        }
        this._player.play();
    };
    Video.prototype.pause = function () {
        this._player.pause();
        if (this._playbackTimeObserverActive) {
            this._removePlaybackTimeObserver();
        }
    };
    Video.prototype.mute = function (mute) {
        this._player.muted = mute;
    };
    Video.prototype.seekToTime = function (ms) {
        var _this = this;
        var seconds = ms / 1000.0;
        var time = CMTimeMakeWithSeconds(seconds, this._player.currentTime().timescale);
        this._player.seekToTimeToleranceBeforeToleranceAfterCompletionHandler(time, kCMTimeZero, kCMTimeZero, function (isFinished) {
            _this._emit(common.Video.seekToTimeCompleteEvent);
        });
    };
    Video.prototype.getDuration = function () {
        var seconds = CMTimeGetSeconds(this._player.currentItem.asset.duration);
        var milliseconds = seconds * 1000.0;
        return milliseconds;
    };
    Video.prototype.getCurrentTime = function () {
        if (this._player === null) {
            return false;
        }
        return (this._player.currentTime().value / this._player.currentTime().timescale) * 1000;
    };
    Video.prototype.setVolume = function (volume) {
        this._player.volume = volume;
    };
    Video.prototype.destroy = function () {
        if (this._didPlayToEndTimeActive) {
            application.ios.removeNotificationObserver(this._didPlayToEndTimeObserver, AVPlayerItemDidPlayToEndTimeNotification);
            this._didPlayToEndTimeActive = false;
        }
        if (this._playbackTimeObserverActive) {
            this._removePlaybackTimeObserver();
        }
        if (this._observerActive = true) {
            this._removeStatusObserver(this._player.currentItem);
        }
        if (this._playbackStartEventListenerActive) {
            this._removePlaybackStartEventListener();
        }
        this.pause();
        this._player.replaceCurrentItemWithPlayerItem(null);
        this._playerController = null;
    };
    Video.prototype._addPlaybackStartEventListener = function () {
        var _this = this;
        this._playbackStartEventListenerActive = true;
        var _intervalOne = CMTimeMake(1, 32);
        var _intervalTwo = CMTimeMake(1, 16);
        var _intervalThree = CMTimeMake(1, 8);
        var _intervalFour = CMTimeMake(1, 4);
        var _intervalFive = CMTimeMake(1, 2);
        var _intervalSix = CMTimeMake(1, 1);
        var _times = NSMutableArray.alloc().initWithCapacity(5);
        _times.addObject(NSValue.valueWithCMTime(_intervalOne));
        _times.addObject(NSValue.valueWithCMTime(_intervalTwo));
        _times.addObject(NSValue.valueWithCMTime(_intervalThree));
        _times.addObject(NSValue.valueWithCMTime(_intervalFour));
        _times.addObject(NSValue.valueWithCMTime(_intervalSix));
        this._playbackStartEventListener = this._player.addBoundaryTimeObserverForTimesQueueUsingBlock(_times, null, function (isFinished) {
            if (!_this._videoPlaying) {
                _this.playbackStart();
            }
        });
    };
    Video.prototype._removePlaybackStartEventListener = function () {
        this._playbackStartEventListenerActive = false;
        this._player.removeTimeObserver(this._playbackStartEventListener);
    };
    Video.prototype._addStatusObserver = function (currentItem) {
        this._observerActive = true;
        currentItem.addObserverForKeyPathOptionsContext(this._observer, "status", 0, null);
    };
    Video.prototype._removeStatusObserver = function (currentItem) {
        this._observerActive = false;
        currentItem.removeObserverForKeyPath(this._observer, "status");
    };
    Video.prototype._addPlaybackTimeObserver = function () {
        var _this = this;
        this._playbackTimeObserverActive = true;
        var _interval = CMTimeMakeWithSeconds(1, this._player.currentTime().timescale);
        this._playbackTimeObserver = this._player.addPeriodicTimeObserverForIntervalQueueUsingBlock(_interval, null, function (currentTime) {
            var _seconds = CMTimeGetSeconds(currentTime);
            var _milliseconds = _seconds * 1000.0;
            _this._setValue(Video.currentTimeProperty, _milliseconds);
            _this._emit(Video.currentTimeUpdatedEvent);
        });
    };
    Video.prototype._removePlaybackTimeObserver = function () {
        this._playbackTimeObserverActive = false;
        this._player.removeTimeObserver(this._playbackTimeObserver);
    };
    Video.prototype._autoplayCheck = function () {
        if (this.autoplay) {
            this.play();
        }
    };
    Video.prototype.playbackReady = function () {
        this._videoLoaded = true;
        this._emit(common.Video.playbackReadyEvent);
    };
    Video.prototype.playbackStart = function () {
        this._videoPlaying = true;
        this._emit(common.Video.playbackStartEvent);
    };
    return Video;
}(common.Video));
exports.Video = Video;
var PlayerObserverClass = (function (_super) {
    __extends(PlayerObserverClass, _super);
    function PlayerObserverClass() {
        _super.apply(this, arguments);
    }
    PlayerObserverClass.prototype.observeValueForKeyPathOfObjectChangeContext = function (path, obj, change, context) {
        if (path === "status") {
            if (this["_owner"]._player.currentItem.status === AVPlayerItemStatusReadyToPlay && !this["_owner"]._videoLoaded) {
                this["_owner"].playbackReady();
            }
        }
    };
    return PlayerObserverClass;
}(NSObject));
