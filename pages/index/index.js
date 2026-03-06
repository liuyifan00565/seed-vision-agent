// pages/index/index.js

const API_URL = 'https://yolo.kzehealth.com/api/seedcount';
// const API_URL = "http://127.0.0.1:5000/api/seedcount"

Page({
  data: {
    target: 100,
    baseCount: 0,
    manualPoints: 0,
    displayImageUrl: '',
    imgW: 0,
    imgH: 0,
    markers: [],
    backendMarkers: [],
    totalCount: 0,
    diffAbs: 0,
    diffPrefix: '少',
    diffSignClass: 'minus',
    locked: false,
    uploading: false,
    showCamera: false,
    
    imageScale: 1,
    translateX: 0,
    translateY: 0,
    
    cameraZoom: 0.5,
    maxZoom: 3,
    cameraContext: null,
  },

  // 容器矩形缓存
  containerRect: null,

  // 手势状态
  gesture: {
    mode: 'none',
    startScale: 1,
    startDist: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pivotX: 0,
    pivotY: 0,
    baseTransX: 0,
    baseTransY: 0,
  },
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0  // 第1个tab
      })
    }
  },
  onLoad() {
    this._recalc();
  },

  setTarget100() { this.setData({ target: 100 }, this._recalc); },
  setTarget200() { this.setData({ target: 200 }, this._recalc); },
  
  onTargetInput(e) {
    const v = parseInt(e.detail.value, 10);
    this.setData({ target: Number.isFinite(v) ? v : 0 }, this._recalc);
  },

  selectFromAlbum() {
    if (this.data.locked) return;
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this._compressAndUpload(path);
      }
    });
  },
  // goCalc() {
  //   wx.navigateTo({ url: "/pages/calculator/index" });
  // },
  
  takePhoto() {
    if (this.data.locked) return;
    this.setData({ 
      showCamera: true,
      cameraZoom: 0.5
    }, () => {
      setTimeout(() => {
        this._initCameraContext();
        this._applyCameraZoom(0.5);
      }, 300);
    });
  },

  closeCameraView() {
    this.setData({ showCamera: false, cameraZoom: 0.5 });
  },

  onCameraReady(e) {
    this._initCameraContext();
    if (e.detail && e.detail.maxZoom) {
      this.setData({ maxZoom: Math.min(e.detail.maxZoom, 5) });
    }
  },

  onCameraError(e) {
    console.error('❌ 相机错误:', e);
    wx.showToast({ title: '相机启动失败', icon: 'error' });
  },

  _initCameraContext() {
    if (!this.data.cameraContext) {
      this.data.cameraContext = wx.createCameraContext();
    }
  },

  onZoomChanging(e) {
    this.setData({ cameraZoom: e.detail.value });
    this._applyCameraZoom(e.detail.value);
  },

  onZoomChange(e) {
    this.setData({ cameraZoom: e.detail.value });
    this._applyCameraZoom(e.detail.value);
  },

  _applyCameraZoom(zoom) {
    if (this.data.cameraContext) {
      this.data.cameraContext.setZoom({
        zoom: zoom,
        success: () => console.log('✅ 相机缩放:', zoom)
      });
    }
  },

  _snapAndAnalyze() {
    if (this.data.locked) return;
    if (!this.data.cameraContext) this._initCameraContext();
    
    this.data.cameraContext.takePhoto({
      quality: 'high',
      success: (res) => {
        this.setData({ showCamera: false, cameraZoom: 0.5 });
        this._compressAndUpload(res.tempImagePath);
      }
    });
  },

  // 🆕 智能压缩图片，确保不超过2MB
  _compressAndUpload(filePath) {
    wx.getFileInfo({
      filePath,
      success: (fileInfo) => {
        const fileSizeMB = fileInfo.size / (1024 * 1024);
        console.log('📊 原始文件大小:', fileSizeMB.toFixed(2), 'MB');
        
        // 如果文件小于1.8MB，直接上传
        if (fileSizeMB < 1.8) {
          this._uploadAndAnalyze(filePath);
          return;
        }
        
        // 需要压缩：根据文件大小智能选择压缩质量
        let quality = 80;
        if (fileSizeMB > 5) quality = 50;
        else if (fileSizeMB > 3) quality = 60;
        else if (fileSizeMB > 2) quality = 70;
        
        console.log('🔄 压缩中，目标质量:', quality);
        
        wx.compressImage({
          src: filePath,
          quality: quality,
          success: (res) => {
            wx.getFileInfo({
              filePath: res.tempFilePath,
              success: (compressedInfo) => {
                const compressedSizeMB = compressedInfo.size / (1024 * 1024);
                console.log('✅ 压缩后大小:', compressedSizeMB.toFixed(2), 'MB');
                
                // 如果压缩后仍超过2MB，再次压缩
                if (compressedSizeMB > 1.9) {
                  wx.compressImage({
                    src: res.tempFilePath,
                    quality: Math.max(40, quality - 20),
                    success: (res2) => {
                      this._uploadAndAnalyze(res2.tempFilePath);
                    },
                    fail: () => {
                      // 二次压缩失败，尝试使用第一次压缩的结果
                      this._uploadAndAnalyze(res.tempFilePath);
                    }
                  });
                } else {
                  this._uploadAndAnalyze(res.tempFilePath);
                }
              }
            });
          },
          fail: (err) => {
            console.error('❌ 压缩失败:', err);
            wx.showModal({
              title: '图片过大',
              content: '图片压缩失败，请选择较小的图片（建议小于2MB）',
              showCancel: false
            });
          }
        });
      },
      fail: () => {
        // 无法获取文件信息，直接尝试上传
        this._uploadAndAnalyze(filePath);
      }
    });
  },

  _uploadAndAnalyze(filePath) {
    if (this.data.uploading) return;
    this.setData({ uploading: true });
    wx.showLoading({ title: '识别中', mask: true });
    this._clearManual();

    wx.uploadFile({
      url: API_URL,
      name: 'file',
      filePath,
      success: ({ data }) => {
        try {
          const resp = JSON.parse(data || '{}');
          const count = +resp.count || 0;
          const dataUrl = resp.image_base64 || '';
          const detections = [];
          const normalizedMarkers = detections.map ? detections.map(d => ({
            x: d.x || d.center_x || 0,
            y: d.y || d.center_y || 0
          })) : [];
          
          if (dataUrl && dataUrl.startsWith('data:image')) {
            this._saveDataUrlToLocal(dataUrl, (savedPath) => {
              this._updateImageData(count, savedPath || filePath, normalizedMarkers);
            });
          } else {
            this._updateImageData(count, filePath, normalizedMarkers);
          }
        } catch (error) {
          console.error('❌ 解析失败:', error);
          wx.showToast({ title: '数据解析失败', icon: 'error' });
        }
      },
      fail: () => {
        wx.showToast({ title: '识别失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ uploading: false });
        wx.hideLoading();
      },
    });
  },

  _saveDataUrlToLocal(dataUrl, callback) {
    try {
      const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        callback(null);
        return;
      }
      const binaryString = wx.base64ToArrayBuffer(matches[2]);
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/temp_${Date.now()}.${matches[1]}`;
      fs.writeFile({
        filePath,
        data: binaryString,
        encoding: 'binary',
        success: () => callback(filePath),
        fail: () => callback(null)
      });
    } catch (error) {
      callback(null);
    }
  },

  _updateImageData(count, imagePath, markers) {
    this.setData({
      baseCount: count,
      displayImageUrl: imagePath,
      backendMarkers: markers,
      markers: [],
      imgW: 0,
      imgH: 0,
      imageScale: 1,
      translateX: 0,
      translateY: 0,
    }, () => {
      this._recalc();
      this._resetGesture();
      this.containerRect = null;
      wx.showToast({ title: `识别完成: ${count}粒`, icon: 'success', duration: 2000 });
    });
  },

  onImageLoad(e) {
    const { width, height } = e.detail;
    if (width && height) {
      wx.createSelectorQuery()
        .select('.gesture-container')
        .boundingClientRect((rect) => {
          if (rect) {
            const displayHeight = height * (rect.width / width);
            this.setData({ imgW: rect.width, imgH: displayHeight });
            this.containerRect = rect;
            console.log('✅ 图片加载完成:', {
              容器宽度: rect.width,
              显示高度: displayHeight,
              原始宽高比: width / height
            });
          }
        })
        .exec();
    }
  },

  onImageError(e) {
    console.error('❌ 图片加载失败');
    wx.showToast({ title: '图片加载失败', icon: 'error' });
  },

  // 🔧 手动标记功能
  onImageTap(e) {
    if (!this.data.displayImageUrl || !this.data.imgW || !this.data.imgH) return;
    
    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;
    
    const query = wx.createSelectorQuery();
    query.select('.img').boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec((res) => {
      if (res && res[0] && res[1]) {
        const imageRect = res[0];
        const scrollOffset = res[1];
        const relativeX = touch.pageX - imageRect.left - scrollOffset.scrollLeft;
        const relativeY = touch.pageY - imageRect.top - scrollOffset.scrollTop;

        if (relativeX >= 0 && relativeX <= imageRect.width && 
            relativeY >= 0 && relativeY <= imageRect.height) {
          const markers = [...this.data.markers, { x: relativeX, y: relativeY }];
          this.setData({ 
            markers, 
            manualPoints: this.data.manualPoints + 1 
          }, this._recalc);
        }
      }
    });
  },

  undoPoint() {
    if (this.data.markers.length === 0) return;
    const markers = this.data.markers.slice(0, -1);
    this.setData({ markers, manualPoints: this.data.manualPoints - 1 }, this._recalc);
  },

  _clearManual() {
    this.setData({ 
      markers: [], 
      manualPoints: 0,
      backendMarkers: [],
      imageScale: 1,
      translateX: 0,
      translateY: 0,
    }, this._recalc);
    this._resetGesture();
  },

  _resetGesture() {
    this.gesture = {
      mode: 'none',
      startScale: 1,
      startDist: 0,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      pivotX: 0,
      pivotY: 0,
      baseTransX: 0,
      baseTransY: 0,
    };
  },

  _recalc() {
    const total = this.data.baseCount + this.data.manualPoints;
    const diff = this.data.target - total;
    this.setData({
      totalCount: total,
      diffAbs: Math.abs(diff),
      diffPrefix: diff < 0 ? '多' : '少',
      diffSignClass: diff < 0 ? 'plus' : 'minus',
    });
  },

  // ✅ 新增：允许用户分享页面
  onShareAppMessage() {
    return {
      title: '智种计 - 智能种子计数助手 🌱',
      path: '/pages/index/index',
      imageUrl: '/assets/share-cover.jpg', // 自定义封面图（需项目中存在）
    };
  },

  // ✅ 新增：分享到朋友圈
  onShareTimeline() {
    return {
      title: '智种计 - 智能AI种子计数助手',
      query: 'from=timeline'
    };
  },
});


