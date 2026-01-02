
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Chat } from '@google/genai';
import SearchBar from './components/SearchBar';
import ReportViewer from './components/ReportViewer';
import { initResearchChat, performResearchStep } from './services/geminiService';
import { GroundingSource, SearchResult } from './types';

type FAQItem = { q: string; a: string };

const App: React.FC = () => {
  // --- 产品 Demo（保留原有能力） ---
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useState({
    industry: '',
    region: '',
    count: 10,
    size: 'all',
    referenceCompany: '',
  });
  const [statusMessage, setStatusMessage] = useState('');
  const chatRef = useRef<Chat | null>(null);

  // --- 营销站交互 ---
  const [leadStatus, setLeadStatus] = useState<'idle' | 'sent'>('idle');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const faqs: FAQItem[] = useMemo(
    () => [
      {
        q: '你们适合哪些团队？',
        a: '适合 ToB 营销/销售/市场情报团队：做行业洞察、找目标客户、做竞品列表、写客户画像、准备销售话术与会议材料。',
      },
      {
        q: '数据从哪里来？会不会“编造”？',
        a: '系统会结合 Google Search Grounding 与公开信息进行多源交叉校验，并输出可追溯的引用来源链接；对缺失字段会明确标注不确定性。',
      },
      {
        q: '能按公司规模筛选吗？',
        a: '可以。支持按人数规模筛选，并且默认按“营收/规模”从高到低排序，方便快速锁定优先级客户。',
      },
      {
        q: '如何落地到增长？',
        a: '建议把“目标行业/地区/对标公司”固化成模板，每周滚动更新 Top 50 目标客户清单 + 关键事件（融资、招人、发布会、合作）来驱动外呼与 ABM。',
      },
    ],
    []
  );

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSearch = useCallback(
    async (industry: string, region: string, count: number, size: string, referenceCompany?: string) => {
      setIsLoading(true);
      setError(null);
      setResult(null);
      setSearchParams({
        industry: industry || '自动识别中',
        region,
        count,
        size,
        referenceCompany: referenceCompany || '',
      });
      setStatusMessage('初始化专家级调研引擎...');

      try {
        const chat = initResearchChat();
        chatRef.current = chat;

        let combinedAnalysis = '';
        let combinedSources: GroundingSource[] = [];

        const batchSize = 10;
        const batches = Math.ceil(count / batchSize);

        for (let i = 0; i < batches; i++) {
          const currentBatchStart = i * batchSize + 1;
          const currentBatchEnd = Math.min((i + 1) * batchSize, count);
          const currentBatchCount = currentBatchEnd - currentBatchStart + 1;

          let batchStatus = `调研阶段 ${i + 1}/${batches}：`;
          if (i === 0) {
            if (!industry && referenceCompany) {
              batchStatus += `正在分析 [${referenceCompany}] 并寻找相似业务对手...`;
            } else {
              batchStatus += `正在通过 Google Search & LinkedIn 合成行业报告并筛选符合 [${size}] 规模的公司...`;
            }
          } else {
            batchStatus += `正在深入挖掘第 ${currentBatchStart}-${currentBatchEnd} 家公司并核对最新营收数据...`;
          }
          setStatusMessage(batchStatus);

          let prompt = '';
          const sizeDescriptionMap = {
            all: '不限规模',
            micro: '1-50人规模',
            small: '50-200人规模',
            medium: '200-1000人规模',
            large: '1000人以上规模',
            giant: '5000人以上极大规模',
          } as const;
          const sizeDescription = sizeDescriptionMap[size as keyof typeof sizeDescriptionMap] ?? '指定规模';

          if (i === 0) {
            if (!industry && referenceCompany) {
              prompt = `请深度调研位于 [${region}] 的行业公司。
1. **对标分析**：首先深度分析 [${referenceCompany}] 的业务范畴。
2. **行业合成**：搜索总结该地区该行业最新的 5 份研究报告。
3. **竞争发现**：在 [${region}] 寻找 ${currentBatchCount} 家与 [${referenceCompany}] 业务逻辑高度相似的 [${sizeDescription}] 公司。
4. **强制要求**：为每家公司标注 \`[业务相似度评分: XX%]\`，并详细解释评分理由。按营收降序排列。`;
            } else {
              prompt = `请深度调研 [${region}] 的 [${industry}] 行业。
1. **多源合成**：分析 5 份以上行业报告并查阅 LinkedIn。
2. **精准检索**：找出前 ${currentBatchCount} 家符合 [${sizeDescription}] 规模的公司。
3. **对标加权**：${
                referenceCompany
                  ? `分析它们与 [${referenceCompany}] 的相似度，并标注 \`[业务相似度评分: XX%]\`。`
                  : `按营收规模排序。`
              }
4. **输出结果**：提供核心业务、营收数据、高管洞察及最新新闻。`;
            }
          } else {
            prompt = `研究继续。请再列出第 ${currentBatchStart} 到 ${currentBatchEnd} 家符合 [${sizeDescription}] 的公司。${
              referenceCompany ? `继续提供与 [${referenceCompany}] 的 [业务相似度评分: XX%]。` : ''
            }请保持按营收严格降序排序。`;
          }

          const stepResult = await performResearchStep(chat, prompt);

          combinedAnalysis += (i > 0 ? `\n\n---\n\n### 补充研究 (第 ${i + 1} 阶段)\n\n` : '') + stepResult.text;
          combinedSources = [...combinedSources, ...stepResult.sources];

          setResult({
            companies: [],
            sources: [...new Set(combinedSources.map((s) => s.uri))].map((uri) => combinedSources.find((s) => s.uri === uri)!),
            rawAnalysis: combinedAnalysis,
          });
        }

        setStatusMessage('全球多源调研报告已就绪');
      } catch (err: any) {
        setError(err.message || '调研任务中断，请检查网络或 API 配置。');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleFollowUp = async (question: string) => {
    if (!chatRef.current || !result) return;

    setIsFollowUpLoading(true);
    try {
      const stepResult = await performResearchStep(chatRef.current, question);
      const updatedAnalysis = result.rawAnalysis + `\n\n---\n\n**专家追问: ${question}**\n\n` + stepResult.text;
      const updatedSources = [...result.sources, ...stepResult.sources];

      setResult({
        ...result,
        rawAnalysis: updatedAnalysis,
        sources: [...new Set(updatedSources.map((s) => s.uri))].map((uri) => updatedSources.find((s) => s.uri === uri)!),
      });
    } catch (err: any) {
      alert('追问处理失败: ' + err.message);
    } finally {
      setIsFollowUpLoading(false);
    }
  };

  const submitLead = (e: React.FormEvent) => {
    e.preventDefault();
    setLeadStatus('sent');
    setTimeout(() => setLeadStatus('idle'), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200 print:hidden">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => scrollToId('top')}
            className="flex items-center gap-3 text-left"
            aria-label="回到顶部"
          >
            <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-indigo-800 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200">
              <i className="fas fa-compass text-lg"></i>
            </div>
            <div>
              <div className="text-lg font-black leading-tight">
                InsightNavigator <span className="text-blue-600 text-xs font-black align-top">B2B</span>
              </div>
              <div className="text-[10px] text-slate-400 font-bold tracking-[0.22em] uppercase">AI GTM Intelligence</div>
            </div>
          </button>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-bold text-slate-600">
            <button className="hover:text-slate-900" onClick={() => scrollToId('product')} type="button">
              产品
            </button>
            <button className="hover:text-slate-900" onClick={() => scrollToId('solutions')} type="button">
              解决方案
            </button>
            <button className="hover:text-slate-900" onClick={() => scrollToId('pricing')} type="button">
              定价
            </button>
            <button className="hover:text-slate-900" onClick={() => scrollToId('demo')} type="button">
              在线体验
            </button>
            <button className="hover:text-slate-900" onClick={() => scrollToId('faq')} type="button">
              FAQ
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => scrollToId('demo')}
              className="hidden sm:inline-flex px-4 py-2 rounded-xl text-sm font-black border border-slate-200 bg-white hover:bg-slate-50"
            >
              先看 Demo
            </button>
            <button
              type="button"
              onClick={() => scrollToId('contact')}
              className="px-4 py-2 rounded-xl text-sm font-black bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200"
            >
              预约演示
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main id="top">
        <section className="relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-[520px] h-[520px] bg-gradient-to-br from-blue-200 via-indigo-200 to-purple-200 rounded-full blur-3xl opacity-60"></div>
          <div className="absolute -bottom-28 -left-28 w-[520px] h-[520px] bg-gradient-to-br from-emerald-200 via-cyan-200 to-blue-200 rounded-full blur-3xl opacity-50"></div>

          <div className="container mx-auto px-6 pt-14 pb-12 relative">
            <div className="max-w-5xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-black text-slate-700 shadow-sm">
                <span className="text-blue-600">新</span>
                <span>从“找公司”到“可执行增长清单”，一页搞定</span>
              </div>

              <h1 className="mt-6 text-5xl md:text-7xl font-black tracking-tighter leading-[1.05]">
                面向 ToB 的
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">营销情报引擎</span>
                <br />
                让 ABM 与外呼更快、更准、更可追溯
              </h1>

              <p className="mt-6 text-lg md:text-xl text-slate-600 max-w-3xl leading-relaxed font-medium">
                自动合成行业报告与公开信息，发现目标客户与竞品，按优先级排序并给出可落地洞察。
                <span className="font-bold text-slate-800">支持对标公司相似度评分、引用来源链接、Excel/PDF 导出。</span>
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => scrollToId('demo')}
                  className="px-6 py-4 rounded-2xl bg-blue-600 text-white font-black text-lg hover:bg-blue-700 shadow-2xl shadow-blue-200"
                >
                  立即在线体验
                  <span className="ml-2 text-white/80 text-sm font-bold">（1 分钟出报告）</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToId('contact')}
                  className="px-6 py-4 rounded-2xl bg-white border border-slate-200 text-slate-900 font-black text-lg hover:bg-slate-50"
                >
                  获取企业版方案
                </button>
              </div>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-500">
                <div className="p-4 rounded-2xl bg-white/70 border border-slate-200">
                  <div className="font-black text-slate-900 text-lg">5+</div>
                  <div className="mt-1 font-bold">行业报告合成</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/70 border border-slate-200">
                  <div className="font-black text-slate-900 text-lg">100</div>
                  <div className="mt-1 font-bold">单次公司数上限</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/70 border border-slate-200">
                  <div className="font-black text-slate-900 text-lg">可追溯</div>
                  <div className="mt-1 font-bold">来源链接与证据链</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/70 border border-slate-200">
                  <div className="font-black text-slate-900 text-lg">GTM</div>
                  <div className="mt-1 font-bold">直接服务增长动作</div>
                </div>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="font-bold">适用于：</span>
                {['市场情报', 'ABM', '销售外呼', '渠道拓展', '竞品分析', '投资/BD'].map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 font-bold"
                  >
                    <i className="fas fa-check text-emerald-600 text-[10px]"></i>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 产品能力 */}
        <section id="product" className="scroll-mt-24">
          <div className="container mx-auto px-6 py-14">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black tracking-tight">把“研究”变成“可执行清单”</h2>
                  <p className="mt-3 text-slate-600 font-medium max-w-2xl">
                    不再从 0 开始搜资料。输入行业/地区/对标公司，即可生成结构化报告与目标公司优先级列表。
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 text-xs font-black">
                    Google Search Grounding
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 text-xs font-black">
                    LinkedIn 线索核验
                  </div>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    icon: 'fa-layer-group',
                    title: '多源合成',
                    desc: '自动综合 5+ 份行业白皮书/研究报告，提炼趋势、格局与门槛。',
                  },
                  {
                    icon: 'fa-bullseye',
                    title: '对标相似度评分',
                    desc: '提供“业务相似度评分”，并解释评分理由，便于快速筛选竞品/标杆。',
                  },
                  {
                    icon: 'fa-shield-halved',
                    title: '证据链与导出',
                    desc: '引用来源链接可追溯，支持复制原文、Excel 清单与 PDF 报告导出。',
                  },
                ].map((f) => (
                  <div key={f.title} className="p-7 rounded-3xl bg-white border border-slate-200 shadow-sm">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                      <i className={`fas ${f.icon}`}></i>
                    </div>
                    <h3 className="mt-5 text-xl font-black">{f.title}</h3>
                    <p className="mt-2 text-slate-600 font-medium leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 解决方案 */}
        <section id="solutions" className="scroll-mt-24">
          <div className="container mx-auto px-6 py-14">
            <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              <div className="p-8 rounded-3xl bg-slate-900 text-white shadow-2xl">
                <div className="text-xs font-black tracking-widest uppercase text-white/60">Playbooks</div>
                <h2 className="mt-4 text-3xl font-black tracking-tight">把调研嵌入你的 GTM 流程</h2>
                <p className="mt-4 text-white/80 font-medium leading-relaxed">
                  用固定模板持续产出“目标客户清单 + 触发事件 + 话术素材”，让销售每天都有可执行的下一步。
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    { t: 'ABM 目标清单', d: '行业/地区/规模筛选 + 优先级排序 + 关键人线索。' },
                    { t: '竞品与对标', d: '输入对标公司，自动发现相似业务玩家并解释差异。' },
                    { t: '客户会议备忘', d: '生成公司概览、近期动态、增长信号与风险点。' },
                  ].map((x) => (
                    <div key={x.t} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                      <div className="font-black">{x.t}</div>
                      <div className="mt-1 text-sm text-white/70 font-medium">{x.d}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="text-xs font-black tracking-widest uppercase text-slate-400">Why teams buy</div>
                <h3 className="mt-4 text-2xl font-black tracking-tight">你会得到什么产出？</h3>
                <div className="mt-6 space-y-4 text-slate-700 font-medium">
                  {[
                    '一份可分享的行业综述（趋势 / 格局 / 门槛 / 机会点）',
                    '一份可导出的目标公司清单（营收/规模优先级）',
                    '每家公司：核心业务、规模线索、关键人、近期新闻与引用来源',
                    '可继续追问：薪酬水平、招聘趋势、区域扩张、合作伙伴等',
                  ].map((t) => (
                    <div key={t} className="flex items-start gap-3">
                      <div className="mt-1 w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
                        <i className="fas fa-check text-xs"></i>
                      </div>
                      <div>{t}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-5 rounded-2xl bg-blue-50 border border-blue-100">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-black text-slate-900">想看你们行业的效果？</div>
                      <div className="mt-1 text-sm text-slate-600 font-medium">直接下滑到“在线体验”，1 分钟生成样例报告。</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => scrollToId('demo')}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 shadow-lg shadow-blue-200"
                    >
                      去体验
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 定价 */}
        <section id="pricing" className="scroll-mt-24">
          <div className="container mx-auto px-6 py-14">
            <div className="max-w-5xl mx-auto">
              <div className="text-center">
                <h2 className="text-3xl md:text-4xl font-black tracking-tight">定价（示例）</h2>
                <p className="mt-3 text-slate-600 font-medium max-w-2xl mx-auto">
                  你可以先用 Demo 验证价值，再按团队规模与权限升级企业版（支持 SSO、审计、模板与知识库）。
                </p>
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    name: 'Starter',
                    price: '¥0',
                    tag: '体验与验证',
                    items: ['在线体验', '基础报告渲染', '复制原文'],
                    cta: '先用 Demo',
                    primary: false,
                    onClick: () => scrollToId('demo'),
                  },
                  {
                    name: 'Team',
                    price: '¥??/月',
                    tag: '增长团队常用',
                    items: ['团队协作', '模板化查询', 'Excel/PDF 导出', '优先队列'],
                    cta: '预约演示',
                    primary: true,
                    onClick: () => scrollToId('contact'),
                  },
                  {
                    name: 'Enterprise',
                    price: '定制',
                    tag: '合规与规模化',
                    items: ['SSO/审计', '私有知识库', '权限与水印', '专属 SLA'],
                    cta: '获取方案',
                    primary: false,
                    onClick: () => scrollToId('contact'),
                  },
                ].map((p) => (
                  <div
                    key={p.name}
                    className={`p-8 rounded-3xl border shadow-sm ${
                      p.primary ? 'bg-slate-900 text-white border-slate-900 shadow-2xl' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className={`text-xs font-black tracking-widest uppercase ${p.primary ? 'text-white/60' : 'text-slate-400'}`}>{p.tag}</div>
                    <div className="mt-3 text-2xl font-black">{p.name}</div>
                    <div className={`mt-4 text-4xl font-black tracking-tight ${p.primary ? 'text-white' : 'text-slate-900'}`}>{p.price}</div>
                    <div className="mt-6 space-y-3 text-sm font-medium">
                      {p.items.map((it) => (
                        <div key={it} className="flex items-center gap-3">
                          <i className={`fas fa-check ${p.primary ? 'text-emerald-300' : 'text-emerald-600'}`}></i>
                          <span className={p.primary ? 'text-white/80' : 'text-slate-700'}>{it}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={p.onClick}
                      className={`mt-8 w-full px-4 py-3 rounded-2xl font-black ${
                        p.primary ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30' : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {p.cta}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 在线体验（Demo） */}
        <section id="demo" className="scroll-mt-24">
          <div className="container mx-auto px-6 py-14">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black tracking-tight">在线体验</h2>
                  <p className="mt-3 text-slate-600 font-medium max-w-2xl">
                    输入行业/地区/规模（或直接输入对标公司），生成可导出的研究报告。你的浏览器需要配置 <span className="font-black">GEMINI_API_KEY</span> 才能运行。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded-xl text-xs font-black border border-blue-100">支持追问</div>
                  <div className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black border border-emerald-100">Excel/PDF</div>
                  <div className="px-3 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-black border border-slate-200">来源可追溯</div>
                </div>
              </div>

              <div className="mt-8">
                <SearchBar onSearch={handleSearch} isLoading={isLoading} />
              </div>

              {isLoading && (
                <div className="flex flex-col items-center justify-center py-18 print:hidden">
                  <div className="relative mb-8">
                    <div className="w-28 h-28 border-8 border-blue-50 rounded-full animate-spin border-t-blue-600"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <i className="fas fa-diagram-project text-3xl text-blue-600"></i>
                    </div>
                  </div>
                  <div className="text-2xl font-black">AI 调研官正在执行任务</div>
                  <div className="mt-3 flex items-center gap-3 px-6 py-2 bg-white rounded-full shadow-lg border border-slate-100">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                    </span>
                    <p className="text-blue-700 font-bold text-sm tracking-wide">{statusMessage}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-6 max-w-5xl mx-auto p-8 bg-red-50 border border-red-100 rounded-3xl flex items-start gap-6 text-red-700 shadow-xl print:hidden">
                  <i className="fas fa-triangle-exclamation mt-1 text-3xl"></i>
                  <div>
                    <h4 className="font-black text-xl mb-2">调研失败</h4>
                    <p className="text-sm font-medium opacity-90 leading-relaxed">{error}</p>
                    <button
                      onClick={() =>
                        handleSearch(searchParams.industry, searchParams.region, searchParams.count, searchParams.size, searchParams.referenceCompany)
                      }
                      className="mt-6 px-6 py-3 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                    >
                      重试
                    </button>
                  </div>
                </div>
              )}

              {result && (
                <div className="mt-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                  <ReportViewer
                    result={result}
                    industry={searchParams.industry}
                    region={searchParams.region}
                    onFollowUp={handleFollowUp}
                    isFollowUpLoading={isFollowUpLoading}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24">
          <div className="container mx-auto px-6 py-14">
            <div className="max-w-4xl mx-auto">
              <div className="text-center">
                <h2 className="text-3xl md:text-4xl font-black tracking-tight">常见问题</h2>
                <p className="mt-3 text-slate-600 font-medium">如果你要做的是“可增长”的研究与情报，这里先回答最常见的 4 个问题。</p>
              </div>

              <div className="mt-10 space-y-4">
                {faqs.map((it, idx) => {
                  const open = openFaqIdx === idx;
                  return (
                    <div key={it.q} className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenFaqIdx(open ? null : idx)}
                        className="w-full px-6 py-5 flex items-center justify-between text-left"
                        aria-expanded={open}
                      >
                        <div className="font-black text-slate-900">{it.q}</div>
                        <div className="w-9 h-9 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700">
                          <i className={`fas ${open ? 'fa-minus' : 'fa-plus'} text-xs`}></i>
                        </div>
                      </button>
                      {open && <div className="px-6 pb-6 text-slate-600 font-medium leading-relaxed">{it.a}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 联系我们 */}
        <section id="contact" className="scroll-mt-24">
          <div className="container mx-auto px-6 py-16">
            <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              <div className="p-10 rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white shadow-2xl">
                <div className="text-xs font-black tracking-widest uppercase text-white/60">Talk to us</div>
                <h2 className="mt-4 text-3xl font-black tracking-tight">想把它用到你们的增长体系里？</h2>
                <p className="mt-4 text-white/80 font-medium leading-relaxed">
                  我们可以根据你的行业、地区与 ICP 目标，给你一套“周更情报 + ABM 清单 + 触发事件”的落地方案。
                </p>

                <div className="mt-8 space-y-3 text-sm font-medium text-white/80">
                  <div className="flex items-center gap-3">
                    <i className="fas fa-clock text-emerald-300"></i>
                    1 个工作日内回复
                  </div>
                  <div className="flex items-center gap-3">
                    <i className="fas fa-lock text-emerald-300"></i>
                    支持企业合规与权限
                  </div>
                  <div className="flex items-center gap-3">
                    <i className="fas fa-file-export text-emerald-300"></i>
                    输出可直接给销售使用
                  </div>
                </div>
              </div>

              <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="font-black text-slate-900 text-xl">预约演示 / 获取企业版方案</div>
                <p className="mt-2 text-sm text-slate-600 font-medium">这里是前端示例表单（无后端）。你也可以直接用你们的线索系统替换。</p>

                <form onSubmit={submitLead} className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <div className="text-xs font-black text-slate-500 mb-1">姓名</div>
                      <input
                        required
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="张三"
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-black text-slate-500 mb-1">邮箱</div>
                      <input
                        required
                        type="email"
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="name@company.com"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <div className="text-xs font-black text-slate-500 mb-1">公司与需求</div>
                    <textarea
                      required
                      rows={4}
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="例如：我们做工业软件，希望找华东地区 200-1000 人规模制造企业，做 ABM 外呼与会议邀约…"
                    />
                  </label>
                  <button
                    type="submit"
                    className="w-full px-5 py-4 rounded-2xl bg-blue-600 text-white font-black text-lg hover:bg-blue-700 shadow-lg shadow-blue-200"
                  >
                    {leadStatus === 'sent' ? '已提交，我们会尽快联系你' : '提交'}
                  </button>
                  <div className="text-xs text-slate-400 font-medium">
                    提交代表你同意我们仅用于联系沟通；不做广告群发。此表单无后端，仅做演示交互。
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 页脚 */}
      <footer className="bg-slate-900 text-slate-500 py-14 print:hidden">
        <div className="container mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10 text-sm">
          <div>
            <div className="text-white font-black text-lg">InsightNavigator</div>
            <p className="mt-2 leading-relaxed">
              面向 ToB 的营销情报与调研引擎：更快产出、来源可追溯、可直接驱动增长动作。
            </p>
          </div>
          <div>
            <div className="text-white font-bold mb-3 uppercase tracking-widest text-xs">Capabilities</div>
            <ul className="space-y-2">
              <li>行业报告合成</li>
              <li>目标客户/竞品发现</li>
              <li>对标相似度评分</li>
              <li>Excel / PDF 导出</li>
            </ul>
          </div>
          <div className="md:text-right">
            <div className="text-white font-bold mb-3 uppercase tracking-widest text-xs">Disclaimer</div>
            <p className="leading-relaxed">
              本站为前端演示项目；调研结果依赖公开信息与模型推断，请结合人工核验与合规要求使用。
            </p>
            <p className="mt-4">© {new Date().getFullYear()} InsightNavigator</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
