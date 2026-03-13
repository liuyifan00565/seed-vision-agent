// cloudfunctions/aiAgent/index.js

const OpenAI = require("openai");

exports.main = async (event) => {

  const input = event.input || "";
  const imageUrl = event.imageUrl || "";  // ← 新增：接收图片URL

  // ========== 图片分析分支（有 imageUrl 时走这里）==========
  if (imageUrl) {
    const client = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    });

    const response = await client.chat.completions.create({
      model: "qwen-vl-max",  // 视觉模型
      messages: [
        {
          role: "system",
          content: "你是智种计APP的种子图像分析专家。分析种子图片，包括：种类识别、外观质量（色泽/饱满度/完整性）、异常情况（霉变/破损/虫蛀）、综合质量评级（优/良/中/差）、改善建议。回答简洁专业，分段展示。"
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: input || "请分析这张种子图片" }
          ]
        }
      ]
    });

    const text = response.choices[0].message.content || "暂无分析结果";
    return { type: "text", text };
  }

  // ========== 原有逻辑完全不动 ==========

  // 🔥 第一层：规则拦截（比赛稳定性）
  if (input.includes("历史")) {
    return {
      type: "task",
      goal: "打开历史记录页面",
      steps: [{ action: "navigate", target: "/pages/history/index" }]
    };
  }

  if (input.includes("报告")) {
    return {
      type: "task",
      goal: "打开作业报告页面",
      steps: [{ action: "navigate", target: "/pages/describe_report/index" }]
    };
  }

  if (input.includes("标签")) {
    return {
      type: "task",
      goal: "打开生成标签页面",
      steps: [{ action: "navigate", target: "/pages/describe_tag/index" }]
    };
  }
// 计数相关 → 引导跳转到种子计数页
  if (input.includes("计数") || input.includes("数一数") || input.includes("数数") || input.includes("多少粒") || input.includes("几粒")) {
    return {
      type: "task",
      goal: "打开种子计数页面",
      steps: [{ action: "navigate", target: "/pages/index/index" }]
    };
  }
  // 第二层：智能体模式
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  });

  const response = await client.chat.completions.create({
    model: "qwen-max",
    messages: [
      {
        role: "system",
        content: `你是农业智能任务调度Agent。

必须返回JSON格式：

{
  "type": "text",
  "content": "回答内容"
}

禁止解释性文字。`
      },
      { role: "user", content: input }
    ],
    response_format: { type: "json_object" }
  });

  const parsed = JSON.parse(response.choices[0].message.content);

  return {
    type: parsed.type,
    text: parsed.content
  };
};