// miniprogram/pages/ai/index.js

/** 调用 aiAgent 云函数（纯文本） */
async function callAgent(question) {
  const res = await wx.cloud.callFunction({
    name: "aiAgent",
    data: { input: question }
  });
  const result = res.result;
  if (result && result.type === "task") {
    return result;
  }
  return { type: "text", text: result && result.text ? result.text : "暂无回复" };
}

/** 调用 aiAgent 云函数（图片分析，fileID 单独传） */
async function callAgentWithImage(fileID, userQuestion) {
  const res = await wx.cloud.callFunction({
    name: "aiAgent",
    data: {
      input: userQuestion || "请分析这张种子图片，识别种类、评估外观质量，给出专业建议",
      fileID: fileID  // 单独传，云函数内转临时URL后给视觉模型
    }
  });
  const result = res.result;
  return result && result.text ? result.text : "暂无回复";
}

Page({
  data: {
    inputText: "",
    isLoading: false,
    scrollIntoView: "",
    keyboardHeight: 0,
    pendingImage: null,
    suggestions: [
      "如何布置光照/背景更利于计数？",
      "计数结果偏多/偏少怎么调？",
      "发芽率怎么算？给公式和例子",
      "如何减少粘连/重叠导致误检？",
      "不同种子大小怎么拍更清晰？",
      "反光、阴影、模糊怎么处理？",
      "如何抽样才科学？（批次/重复）",
      "计数误差如何评估与校准？",
      "如何导出结果/生成报告？"
    ],
    messages: []
  },

  showImageOptions() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        const source = res.tapIndex === 0 ? 'camera' : 'album';
        this.chooseImage({ currentTarget: { dataset: { source } } });
      }
    });
  },

  async onDoAction(e) {
    const { type, fileid } = e.currentTarget.dataset;
    if (type !== "defect" || !fileid || this.data.isLoading) return;

    const now = this._fmtTime(new Date());
    const aiMsg = {
      role: "assistant",
      time: now,
      isTyping: true,
      versions: [{ content: "🧪 正在进行缺陷评估…", time: now }],
      activeVersionIndex: 0,
      historyExpanded: false,
      compare: null
    };

    this.setData(
      { messages: [...this.data.messages, aiMsg], isLoading: true },
      () => this._scrollToBottom()
    );

    try {
      const answer = await callAgentWithImage(fileid, "请对这张种子图片进行详细缺陷评估，包括外观、色泽、破损情况");
      const reply = this._normalizeReply(answer || "暂无返回");
      const newNow = this._fmtTime(new Date());

      const updated = this.data.messages.slice();
      const lastIndex = updated.length - 1;
      updated[lastIndex] = {
        ...updated[lastIndex],
        time: newNow,
        isTyping: false,
        versions: [{ content: reply, time: newNow }],
        activeVersionIndex: 0
      };
      this.setData({ messages: updated, isLoading: false }, () => this._scrollToBottom());
    } catch (err) {
      const updated = this.data.messages.slice();
      const lastIndex = updated.length - 1;
      updated[lastIndex] = {
        ...updated[lastIndex],
        isTyping: false,
        versions: [{ content: "❌ 缺陷评估失败，请稍后再试。", time: this._fmtTime(new Date()) }],
        activeVersionIndex: 0
      };
      this.setData({ messages: updated, isLoading: false });
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onLoad() {
    const now = this._fmtTime(new Date());
    wx.onKeyboardHeightChange((res) => {
      this.setData({ keyboardHeight: res.height });
    });
    const hello = {
      role: "assistant",
      time: now,
      isTyping: false,
      versions: [{
        content: "你好！我是智种计AI助手。🌱\n\n我能帮你：\n\n📸 图片分析 - 先上传图片，再描述你想了解的内容\n💡 专业解答 - 回答光照布置、计数偏差、发芽率计算等问题\n📊 质检建议 - 提供科学的抽样方法和误差评估\n\n点击相机或相册图标上传图片，或直接提问～",
        time: now
      }],
      activeVersionIndex: 0,
      historyExpanded: false,
      compare: null
    };
    this.setData({ messages: [hello] }, () => this._scrollToBottom());
  },

  onInput(e) { this.setData({ inputText: e.detail.value }); },
  onClear() { this.setData({ inputText: "" }); },
  onTapSuggestion(e) { this.setData({ inputText: e.currentTarget.dataset.text || "" }); },
  onInputFocus() { this._scrollToBottom(); },
  onInputBlur() {},

  async chooseImage(e) {
    if (this.data.isLoading) return;
    const source = e.currentTarget.dataset.source;
    try {
      const pick = await wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [source],
        sizeType: ['compressed'],
        maxDuration: 30
      });
      const filePath = pick && pick.tempFiles && pick.tempFiles[0]
        ? pick.tempFiles[0].tempFilePath : "";
      if (!filePath) return;
      this.setData({ pendingImage: { url: filePath, filePath, fileID: null } });
      wx.showToast({ title: "图片已选择", icon: "success", duration: 1500 });
    } catch (err) {
      console.error("选择图片失败：", err);
      wx.showToast({ title: "选择图片失败", icon: "none" });
    }
  },

  previewPendingImage() {
    if (!this.data.pendingImage || !this.data.pendingImage.url) return;
    wx.previewImage({ urls: [this.data.pendingImage.url], current: this.data.pendingImage.url });
  },

  removePendingImage() {
    this.setData({ pendingImage: null });
    wx.showToast({ title: "已移除图片", icon: "success", duration: 1000 });
  },

  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    wx.previewImage({ urls: [src], current: src });
  },

  async onSend() {
    const text = (this.data.inputText || "").trim();
    const hasPendingImage = !!this.data.pendingImage;
    if (!text && !hasPendingImage) return;
    if (this.data.isLoading) return;

    const now = this._fmtTime(new Date());
    if (hasPendingImage) {
      await this._sendImageMessage(text, now);
    } else {
      await this._sendTextMessage(text, now);
    }
  },

  async _sendImageMessage(userQuestion, now) {
    const pendingImage = this.data.pendingImage;

    const userImgMsg = {
      role: "user",
      type: "image",
      imageUrl: pendingImage.url,
      content: userQuestion || "请帮我分析这张图片",
      time: now
    };

    const aiMsg = {
      role: "assistant",
      time: now,
      isTyping: true,
      versions: [{ content: "🔍 正在分析图片…", time: now }],
      activeVersionIndex: 0,
      historyExpanded: false,
      compare: null
    };

    this.setData({
      messages: [...this.data.messages, userImgMsg, aiMsg],
      isLoading: true,
      inputText: "",
      pendingImage: null
    }, () => this._scrollToBottom());

    try {
      // 上传云存储
      const cloudPath = `diagnosis/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: pendingImage.filePath });
      const fileID = up.fileID;
      console.log("上传结果 up:", JSON.stringify(up));  // ← 加这行
      console.log("fileID:", fileID);                   // ← 加这行
      if (!fileID) throw new Error("上传失败：未获得 fileID");

      // 调用视觉模型分析
      const answer = await callAgentWithImage(fileID, userQuestion || "请分析这张种子图片，识别种类、评估外观质量");
      const reply = this._normalizeReply(answer || "暂无返回");
      const newNow = this._fmtTime(new Date());

      const updated = this.data.messages.slice();
      const lastIndex = updated.length - 1;
      updated[lastIndex] = {
        ...updated[lastIndex],
        time: newNow,
        isTyping: false,
        versions: [{
          content: reply + "\n\n需要我再做一次【缺陷评估】吗？",
          time: newNow
        }],
        activeVersionIndex: 0,
        historyExpanded: false,
        compare: null,
        actions: [{ type: "defect", label: "做缺陷评估", fileID }]
      };
      this.setData({ messages: updated, isLoading: false }, () => this._scrollToBottom());
    } catch (err) {
      const msg = "❌ 图片分析失败：\n" + (err && err.message ? err.message : "unknown");
      const updated = this.data.messages.slice();
      const lastIndex = updated.length - 1;
      if (updated[lastIndex] && updated[lastIndex].role === "assistant") {
        updated[lastIndex] = {
          ...updated[lastIndex],
          isTyping: false,
          versions: [{ content: msg, time: this._fmtTime(new Date()) }],
          activeVersionIndex: 0
        };
      }
      this.setData({ messages: updated, isLoading: false, pendingImage: null }, () => this._scrollToBottom());
    }
  },

  async _sendTextMessage(text, now) {
    const userMsg = { role: "user", content: text, time: now };
    const aiMsg = {
      role: "assistant",
      time: now,
      isTyping: true,
      versions: [{ content: "🤔 正在思考中…", time: now }],
      activeVersionIndex: 0,
      historyExpanded: false,
      compare: null
    };

    const messagesWithAI = [...this.data.messages, userMsg, aiMsg];
    this.setData({ messages: messagesWithAI, inputText: "", isLoading: true }, () => this._scrollToBottom());

    try {
      const result = await this._callAIFromConversation(messagesWithAI);

      if (result && result.type === "task") {
        const updated = [...this.data.messages];
        updated.pop();
        this.setData({ messages: updated, isLoading: false }, () => {
          this.executeTask(result);
        });
        return;
      }

      const reply = this._normalizeReply(result && result.text ? result.text : "暂无回复");
      const newNow = this._fmtTime(new Date());
      const updated = [...this.data.messages];
      const lastIndex = updated.length - 1;
      updated[lastIndex] = {
        ...updated[lastIndex],
        time: newNow,
        isTyping: false,
        versions: [{ content: reply, time: newNow }],
        activeVersionIndex: 0,
        historyExpanded: false,
        compare: null
      };
      this.setData({ messages: updated, isLoading: false }, () => this._scrollToBottom());
    } catch (err) {
      const updated = [...this.data.messages];
      const lastIndex = updated.length - 1;
      updated[lastIndex] = {
        ...updated[lastIndex],
        isTyping: false,
        versions: [{
          content: "❌ 请求失败：\n" + (err && err.message || "unknown") + "\n\n（请检查网络或稍后重试）",
          time: this._fmtTime(new Date())
        }],
        activeVersionIndex: 0
      };
      this.setData({ messages: updated, isLoading: false }, () => this._scrollToBottom());
    }
  },

  copyText(e) {
    const text = e.currentTarget.dataset.text || "";
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制", icon: "success", duration: 1500 })
    });
  },

  copyActiveVersion(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const item = this.data.messages[idx];
    if (!item || item.role !== "assistant") return;
    const v = item.versions && item.versions[item.activeVersionIndex];
    const text = v && v.content ? v.content : "";
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制", icon: "success", duration: 1500 })
    });
  },

  toggleHistory(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const messages = [...this.data.messages];
    const item = messages[idx];
    if (!item || item.role !== "assistant") return;
    item.historyExpanded = !item.historyExpanded;
    messages[idx] = item;
    this.setData({ messages }, () => this._scrollToBottom());
  },

  setCompare(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const vindex = Number(e.currentTarget.dataset.vindex);
    const messages = [...this.data.messages];
    const item = messages[idx];
    if (!item || item.role !== "assistant") return;
    item.compare = { vindex };
    item.historyExpanded = true;
    messages[idx] = item;
    this.setData({ messages }, () => this._scrollToBottom());
  },

  useVersion(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const vindex = Number(e.currentTarget.dataset.vindex);
    const messages = [...this.data.messages];
    const item = messages[idx];
    if (!item || item.role !== "assistant") return;
    if (!item.versions || vindex < 0 || vindex >= item.versions.length) return;
    item.activeVersionIndex = vindex;
    item.compare = null;
    messages[idx] = item;
    wx.showToast({ title: "已切换版本", icon: "success", duration: 1500 });
    this.setData({ messages });
  },

  async regenerateAt(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (this.data.isLoading) return;
    const messages = [...this.data.messages];
    const target = messages[idx];
    if (!target || target.role !== "assistant") return;

    target.isTyping = true;
    messages[idx] = target;
    this.setData({ messages, isLoading: true }, () => this._scrollToBottom());

    try {
      const convo = this._buildConversationForRegenerate(idx);
      const replyRaw = await this._callAIFromConversation(convo);
      const reply = this._normalizeReply(replyRaw && replyRaw.text ? replyRaw.text : "暂无回复");
      const now = this._fmtTime(new Date());

      const updated = [...this.data.messages];
      const it = updated[idx];
      const versions = Array.isArray(it.versions) ? [...it.versions] : [];
      versions.push({ content: reply, time: now });
      it.versions = versions;
      it.activeVersionIndex = versions.length - 1;
      it.isTyping = false;
      it.time = now;
      it.historyExpanded = true;
      it.compare = null;
      updated[idx] = it;
      this.setData({ messages: updated, isLoading: false }, () => this._scrollToBottom());
    } catch (err) {
      const updated = this.data.messages.slice();
      const it = updated[idx];
      it.isTyping = false;
      it.historyExpanded = true;
      it.versions = (it.versions || []).concat([{
        content: "❌ 重新生成失败：\n" + (err && err.message || "unknown"),
        time: this._fmtTime(new Date())
      }]);
      it.activeVersionIndex = it.versions.length - 1;
      updated[idx] = it;
      this.setData({ messages: updated, isLoading: false }, () => this._scrollToBottom());
    }
  },

  async _callAIFromConversation(messages) {
    let userText = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user" && messages[i].content) {
        userText = messages[i].content;
        break;
      }
    }
    console.log("发送给Agent:", userText);
    return await callAgent(userText);
  },

  _buildConversationForRegenerate(idx) {
    const raw = this.data.messages || [];
    const prev = raw.slice(0, idx);
    let lastUser = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (raw[i].role === "user" && raw[i].type !== "image") {
        lastUser = raw[i];
        break;
      }
    }
    if (lastUser) {
      const tail = prev[prev.length - 1];
      if (!tail || tail.role !== "user" || (tail.content || "") !== (lastUser.content || "")) {
        prev.push(lastUser);
      }
    }
    return prev;
  },

  _scrollToBottom() {
    const len = (this.data.messages || []).length;
    if (!len) return;
    this.setData({ scrollIntoView: `msg-${len - 1}` });
  },

  _fmtTime(d) {
    const pad = (n) => (n < 10 ? "0" + n : "" + n);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  executeTask(task) {
    const step = task.steps[0];
    console.log("执行步骤：", step);
    this.setData({ isLoading: false });
    if (step.action === "navigate") {
      wx.navigateTo({ url: step.target });
    }
    wx.showToast({ title: "准备跳转", icon: "none" });
  },

  _normalizeReply(text) {
    let t = (text || "").toString();
    t = t.replace(/^\s+/, "");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t;
  }
});
