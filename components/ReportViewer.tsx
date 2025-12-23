
import React, { useState, useRef } from 'react';
import { SearchResult } from '../types';
import * as XLSX from 'xlsx';

interface ReportViewerProps {
  result: SearchResult;
  industry: string;
  region: string;
  onFollowUp: (question: string) => void;
  isFollowUpLoading: boolean;
}

declare const html2pdf: any;

const ReportViewer: React.FC<ReportViewerProps> = ({ result, industry, region, onFollowUp, isFollowUpLoading }) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [followUpText, setFollowUpText] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.rawAnalysis);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownloadExcel = () => {
    try {
      const lines = result.rawAnalysis.split('\n');
      const companiesData: any[] = [];
      let currentCompany: any = null;

      lines.forEach(line => {
        const trimmed = line.trim();
        // 识别公司标题
        if (trimmed.startsWith('## ') && !trimmed.includes('总结') && !trimmed.includes('摘要')) {
          if (currentCompany) companiesData.push(currentCompany);
          
          const rawName = trimmed.replace('## ', '').trim();
          const similarityMatch = rawName.match(/\[业务相似度评分: (\d+)%\]/);
          const nameOnly = rawName.replace(/\[业务相似度评分: \d+%\]/g, '').trim();
          
          currentCompany = {
            '公司名称': nameOnly,
            '业务相似度': similarityMatch ? `${similarityMatch[1]}%` : 'N/A',
            '营收/规模数据': '详见报告',
            '核心业务': '',
            '最新动态': ''
          };
        } else if (currentCompany) {
          if (trimmed.includes('营收') || trimmed.includes('规模') || trimmed.includes('员工')) {
            currentCompany['营收/规模数据'] = trimmed.replace(/^[-*]\s+/, '');
          } else if (trimmed.includes('业务') || trimmed.includes('核心')) {
            currentCompany['核心业务'] += trimmed.replace(/^[-*]\s+/, '') + ' ';
          } else if (trimmed.includes('新闻') || trimmed.includes('动态')) {
            currentCompany['最新动态'] += trimmed.replace(/^[-*]\s+/, '') + ' ';
          }
        }
      });

      if (currentCompany) companiesData.push(currentCompany);

      if (companiesData.length === 0) {
        // 兜底方案：如果没解析出 ## 结构，尝试解析总结清单
        const summaryStart = lines.findIndex(l => l.includes('调研公司清单总结'));
        if (summaryStart !== -1) {
          lines.slice(summaryStart + 1).forEach(l => {
            const match = l.match(/^\d+\.\s+(.+)$/);
            if (match) {
              companiesData.push({ '公司名称': match[1].trim() });
            }
          });
        }
      }

      if (companiesData.length === 0) {
        alert("未能在报告中解析出结构化数据，请重试生成。");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(companiesData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "调研清单");
      
      // 设置列宽
      worksheet['!cols'] = [
        { wch: 30 }, // 公司名称
        { wch: 15 }, // 相似度
        { wch: 30 }, // 营收
        { wch: 50 }, // 核心业务
        { wch: 50 }  // 最新动态
      ];

      XLSX.writeFile(workbook, `公司调研清单-${industry}-${region}.xlsx`);
    } catch (error) {
      console.error("Excel Export Error:", error);
      alert("导出失败，请检查浏览器控制台。");
    }
  };

  const handleDownloadPDF = () => {
    if (!reportRef.current) return;
    const element = reportRef.current;
    const opt = {
      margin: 10,
      filename: `深度研究报告-${industry}-${region}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  const submitFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (followUpText.trim() && !isFollowUpLoading) {
      onFollowUp(followUpText.trim());
      setFollowUpText('');
    }
  };

  const renderTextWithBadges = (text: string) => {
    const parts = text.split(/(\[业务相似度评分: \d+%\])/g);
    return parts.map((part, i) => {
      const match = part.match(/\[业务相似度评分: (\d+)%\]/);
      if (match) {
        const score = parseInt(match[1]);
        const colorClass = score > 80 ? 'bg-green-100 text-green-700 border-green-200' :
                           score > 50 ? 'bg-blue-100 text-blue-700 border-blue-200' :
                           'bg-slate-100 text-slate-700 border-slate-200';
        return (
          <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black border ${colorClass} mx-1 shadow-sm`}>
            <i className="fas fa-bullseye text-[10px]"></i>
            相似度 {score}%
          </span>
        );
      }
      return part;
    });
  };

  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('## ')) {
        const titleText = trimmedLine.replace('## ', '');
        return (
          <h2 key={i} className="text-2xl font-bold text-slate-800 mt-10 mb-4 border-b pb-2 flex items-center flex-wrap gap-2">
            <i className="fas fa-building text-blue-500"></i> 
            {renderTextWithBadges(titleText)}
          </h2>
        );
      }
      if (trimmedLine.startsWith('# ')) {
        return <h1 key={i} className="text-3xl font-extrabold text-slate-900 mt-12 mb-6 text-center">{trimmedLine.replace('# ', '')}</h1>;
      }
      if (trimmedLine.startsWith('### ')) {
        return <h3 key={i} className="text-xl font-semibold text-slate-700 mt-6 mb-3">{trimmedLine.replace('### ', '')}</h3>;
      }
      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        return <li key={i} className="ml-6 mb-2 text-slate-600 list-disc">{renderTextWithBadges(trimmedLine.substring(2))}</li>;
      }
      // 特殊处理清单总结部分
      const listMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
      if (listMatch) {
        return (
          <div key={i} className="flex items-center gap-3 py-1.5 px-4 bg-blue-50/50 rounded-lg border border-blue-100/50 mb-2">
            <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-600 text-white text-xs font-bold rounded-full">{trimmedLine.split('.')[0]}</span>
            <span className="font-bold text-slate-700">{listMatch[1]}</span>
          </div>
        );
      }
      if (trimmedLine === '') {
        return <div key={i} className="h-4"></div>;
      }
      return <p key={i} className="mb-3 text-slate-600 leading-relaxed">{renderTextWithBadges(line)}</p>;
    });
  };

  return (
    <div className="w-full max-w-5xl mx-auto pb-24">
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 mb-8">
        <div className="p-8 md:p-12">
          {/* Action Bar */}
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100 print:hidden">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-blue-600 mb-1">Depth Analysis Report</h2>
              <p className="text-slate-400 text-xs">Industry: {industry} | Region: {region}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={handleCopy} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${copyStatus === 'copied' ? 'bg-green-50 text-green-600' : 'text-slate-500 hover:bg-slate-50'}`}>
                <i className={`fas ${copyStatus === 'copied' ? 'fa-check' : 'fa-copy'}`}></i>
                <span className="hidden sm:inline">{copyStatus === 'copied' ? '已复制' : '复制原文'}</span>
              </button>
              <button onClick={handleDownloadExcel} className="text-emerald-600 hover:bg-emerald-50 px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2">
                <i className="fas fa-file-excel"></i>
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button onClick={handleDownloadPDF} className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2">
                <i className="fas fa-file-pdf"></i>
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>

          {/* Analysis Content */}
          <div ref={reportRef} className="prose prose-slate max-w-none">
            {renderContent(result.rawAnalysis)}
            
            {result.sources.length > 0 && (
              <div className="mt-16 pt-8 border-t border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <i className="fas fa-link text-blue-500"></i>
                  引用来源与深度链接
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.sources.map((source, idx) => (
                    <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-50 rounded-lg border border-slate-100 hover:bg-blue-50 transition-all text-sm truncate block">
                      <span className="font-medium text-slate-700">{source.title}</span>
                      <div className="text-xs text-slate-400">{source.uri}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Follow-up Question Box */}
      <div className="sticky bottom-8 z-40 print:hidden px-4 sm:px-0">
        <form onSubmit={submitFollowUp} className="max-w-4xl mx-auto bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-2 border border-blue-100 flex items-center gap-2">
          <div className="flex-1 flex items-center px-4">
            <i className="fas fa-comment-dots text-blue-400 mr-3"></i>
            <input 
              type="text" 
              placeholder="继续追问细节（如：对比该地区的平均薪酬水平）"
              className="w-full bg-transparent border-none outline-none py-3 text-slate-700 font-medium text-sm sm:text-base"
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              disabled={isFollowUpLoading}
            />
          </div>
          <button 
            type="submit" 
            disabled={!followUpText.trim() || isFollowUpLoading}
            className={`px-4 sm:px-6 py-3 rounded-xl font-black flex items-center gap-2 transition-all text-sm ${
              !followUpText.trim() || isFollowUpLoading ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
            }`}
          >
            {isFollowUpLoading ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-paper-plane"></i>}
            <span>{isFollowUpLoading ? '处理中' : '追问'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ReportViewer;
