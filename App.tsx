
import React, { useState, useCallback, useRef } from 'react';
import { initResearchChat, performResearchStep } from './services/geminiService';
import { SearchResult, GroundingSource } from './types';
import SearchBar from './components/SearchBar';
import ReportViewer from './components/ReportViewer';
import { Chat } from '@google/genai';

const App: React.FC = () => {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useState({ industry: '', region: '', count: 10, size: 'all', referenceCompany: '' });
  const [statusMessage, setStatusMessage] = useState('');
  
  const chatRef = useRef<Chat | null>(null);

  const handleSearch = useCallback(async (industry: string, region: string, count: number, size: string, referenceCompany?: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setSearchParams({ industry: industry || '自动识别中', region, count, size, referenceCompany: referenceCompany || '' });
    setStatusMessage('初始化专家级调研引擎...');

    try {
      const chat = initResearchChat();
      chatRef.current = chat;
      
      let combinedAnalysis = "";
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
        
        let prompt = "";
        const sizeDescription = {
          all: "不限规模",
          micro: "1-50人规模",
          small: "50-200人规模",
          medium: "200-1000人规模",
          large: "1000人以上规模",
          giant: "5000人以上极大规模"
        }[size as keyof typeof sizeDescription] || "指定规模";

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
3. **对标加权**：${referenceCompany ? `分析它们与 [${referenceCompany}] 的相似度，并标注 \`[业务相似度评分: XX%]\`。` : `按营收规模排序。`}
4. **输出结果**：提供核心业务、营收数据、高管洞察及最新新闻。`;
          }
        } else {
          prompt = `研究继续。请再列出第 ${currentBatchStart} 到 ${currentBatchEnd} 家符合 [${sizeDescription}] 的公司。${referenceCompany ? `继续提供与 [${referenceCompany}] 的 [业务相似度评分: XX%]。` : ""}请保持按营收严格降序排序。`;
        }

        const stepResult = await performResearchStep(chat, prompt);
        
        combinedAnalysis += (i > 0 ? "\n\n---\n\n### 补充研究 (第 " + (i + 1) + " 阶段)\n\n" : "") + stepResult.text;
        combinedSources = [...combinedSources, ...stepResult.sources];
        
        setResult({
          companies: [],
          sources: [...new Set(combinedSources.map(s => s.uri))].map(uri => combinedSources.find(s => s.uri === uri)!),
          rawAnalysis: combinedAnalysis
        });
      }

      setStatusMessage('全球多源调研报告已就绪');
    } catch (err: any) {
      setError(err.message || '调研任务中断，请检查网络或 API 配置。');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        sources: [...new Set(updatedSources.map(s => s.uri))].map(uri => updatedSources.find(s => s.uri === uri)!)
      });
    } catch (err: any) {
      alert("追问处理失败: " + err.message);
    } finally {
      setIsFollowUpLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-200 py-5 shadow-sm print:hidden">
        <div className="container mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-800 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200">
              <i className="fas fa-microchip text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 leading-tight">InsightNavigator <span className="text-blue-600 text-sm font-bold align-top">PRO</span></h1>
              <p className="text-[10px] text-slate-400 font-bold tracking-[0.2em] uppercase">LinkedIn & Whitepaper Synthesis Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex gap-3">
              <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black border border-blue-100 uppercase">Batch Pro: 100 Limit</div>
              <div className="px-3 py-1 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-black border border-purple-100 uppercase">Linked-In Verified</div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-6 py-10">
        {!result && !isLoading && (
          <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-6 duration-1000 print:hidden">
            <h2 className="text-7xl font-black text-slate-900 mb-8 tracking-tighter leading-none">
              极深度对标调研，<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">从 LinkedIn 到白皮书</span>
            </h2>
            <p className="text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed font-medium">
              支持检索多达 100 家企业，自动合成 5+ 份行业报告。
              <br/>按照营收严格排序，支持精准业务相似度对标。
            </p>
          </div>
        )}

        <div className="print:hidden">
          <SearchBar onSearch={handleSearch} isLoading={isLoading} />
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 print:hidden">
            <div className="relative mb-10">
              <div className="w-32 h-32 border-8 border-blue-50 rounded-full animate-spin border-t-blue-600"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <i className="fas fa-project-diagram text-4xl text-blue-600"></i>
              </div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">AI 调研官正在执行任务</h3>
            <div className="flex items-center gap-3 px-6 py-2 bg-white rounded-full shadow-lg border border-slate-100">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
              <p className="text-blue-700 font-bold text-sm tracking-wide">{statusMessage}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-3xl mx-auto p-8 bg-red-50 border border-red-100 rounded-3xl flex items-start gap-6 text-red-700 shadow-xl animate-in zoom-in-95 duration-300 print:hidden">
            <i className="fas fa-shield-virus mt-1 text-3xl"></i>
            <div>
              <h4 className="font-black text-xl mb-2">调研会话已阻断</h4>
              <p className="text-sm font-medium opacity-90 leading-relaxed">{error}</p>
              <button 
                onClick={() => handleSearch(searchParams.industry, searchParams.region, searchParams.count, searchParams.size, searchParams.referenceCompany)} 
                className="mt-6 px-6 py-3 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700 transition-all shadow-lg shadow-red-200"
              >
                重试调研
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
            <ReportViewer 
              result={result} 
              industry={searchParams.industry}
              region={searchParams.region}
              onFollowUp={handleFollowUp}
              isFollowUpLoading={isFollowUpLoading}
            />
          </div>
        )}
      </main>

      <footer className="bg-slate-900 text-slate-500 py-16 print:hidden">
        <div className="container mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 text-sm">
          <div>
            <h4 className="text-white font-bold mb-4 uppercase tracking-widest text-xs">Research Methodology</h4>
            <p className="leading-relaxed">基于 Google Search Grounding 和 LinkedIn 公开数据，结合 Gemini 3.0 Flash 处理逻辑，执行多阶段交叉验证排序。</p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4 uppercase tracking-widest text-xs">Data Sources</h4>
            <ul className="space-y-2">
              <li>• LinkedIn People & Firmographics</li>
              <li>• Industry Whitepapers & Reports</li>
              <li>• Financial Statements (Public Firms)</li>
              <li>• Local Gov & Registry Records</li>
            </ul>
          </div>
          <div className="text-right">
            <p className="font-black text-white text-lg">InsightNavigator PRO</p>
            <p className="mt-2">© 2024 专业级行业对标调研系统</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
