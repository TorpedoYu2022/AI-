
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { SearchResult, GroundingSource } from "../types";

const SYSTEM_INSTRUCTION = `你是一位世界顶级的行业研究与竞争情报专家。你的任务是根据用户提供的“行业+地区+规模”以及“参考对标公司”进行极深度的公司发现与多维核查。

必须严格遵循以下专业级研究流程：
1. **行业报告合成 (Synthesis)**：
   - 在列出公司前，必须先搜索并综合分析至少 5-10 份最新的行业白皮书、市场研究报告、智库深度分析。
   - 提取该行业在该地区的最新趋势、竞争格局和准入门槛。
2. **多源交叉核实 (LinkedIn & 权威榜单)**：
   - **必须利用 Google Search 模拟 LinkedIn 查询**，核实公司员工规模、核心管理层背景及活跃度。
   - 对比至少 5 个独立的权威来源（行业协会、财经媒体、政府公示、纳税大户名单等）。
3. **中国区专项研究 (WeChat Analysis)**：
   - 如果地区涉及中国，必须通过搜索核实其微信公众号活跃度，标注格式：[WeChat: 账户名称]。
4. **规模与地区硬性筛选**：
   - 严格按照用户设定的“公司人数规模”进行筛选，剔除不符合规模要求的企业。
5. **业务相似度分析 (仅在提供对标公司时)**：
   - 如果用户提供了“对标公司”，你必须为搜索到的每一家公司计算一个 **[业务相似度评分: XX%]**。
6. **结构化输出与排序规则**：
   - **强制排序**：必须按照“营收规模”从高到低排列。营收数据缺失时，依次按“员工数”和“融资轮次/市场声量”排序。
   - 每家公司详述：核心业务逻辑、营收数据、员工精确区间、LinkedIn 上的关键高管发现、近期重大新闻。
7. **调研总结 (强制要求)**：
   - 在报告的最末尾，添加一个名为“## 调研公司清单总结”的章节。
   - 在该章节下，仅以 \`序号. 公司名称\` 的纯列表形式列出本次调研涉及的所有公司，例如：
     1. 公司 A
     2. 公司 B

输出要求：
- Markdown 格式，层级分明。
- 结尾提供数据综合置信度评估。`;

export interface ResearchContext {
  chat: Chat;
  allAnalysis: string;
  sources: GroundingSource[];
}

export const initResearchChat = (): Chat => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  return ai.chats.create({
    model: 'gemini-3-pro-preview', // 使用更强大的模型处理复杂调研
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
    },
  });
};

export const performResearchStep = async (chat: Chat, prompt: string): Promise<{ text: string; sources: GroundingSource[] }> => {
  const response: GenerateContentResponse = await chat.sendMessage({ message: prompt });
  const text = response.text || "";
  
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks
    .filter((chunk: any) => chunk.web)
    .map((chunk: any) => ({
      title: chunk.web.title || "参考来源",
      uri: chunk.web.uri,
    }));

  return { text, sources };
};
