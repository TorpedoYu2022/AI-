
import React, { useState } from 'react';

interface SearchBarProps {
  onSearch: (industry: string, region: string, count: number, size: string, referenceCompany?: string) => void;
  isLoading: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading }) => {
  const [industry, setIndustry] = useState('');
  const [region, setRegion] = useState('');
  const [referenceCompany, setReferenceCompany] = useState('');
  const [count, setCount] = useState<number>(10);
  const [size, setSize] = useState('all');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 逻辑：(行业 OR 对标公司) 且 地区 必填
    if ((industry || referenceCompany) && region) {
      onSearch(industry, region, count, size, referenceCompany);
    }
  };

  // 提交按钮的启用逻辑
  const canSubmit = !isLoading && region && (industry || referenceCompany);

  return (
    <div className="w-full max-w-5xl mx-auto mb-8">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl overflow-hidden p-3 flex flex-col gap-3 border border-slate-200">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-[2] flex items-center px-5 py-3 bg-slate-50 rounded-2xl group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <i className="fas fa-briefcase text-slate-400 mr-3 group-focus-within:text-blue-500"></i>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder={referenceCompany ? "所属行业 (可选)" : "所属行业 (如: 半导体)"}
              className="bg-transparent border-none outline-none w-full text-slate-700 placeholder:text-slate-400 font-medium"
              disabled={isLoading}
            />
          </div>
          <div className="flex-[2] flex items-center px-5 py-3 bg-slate-50 rounded-2xl group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <i className="fas fa-location-dot text-slate-400 mr-3 group-focus-within:text-blue-500"></i>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="目标地区 (如: 长三角, 新加坡)"
              className="bg-transparent border-none outline-none w-full text-slate-700 placeholder:text-slate-400 font-medium"
              disabled={isLoading}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 flex items-center px-5 py-3 bg-blue-50/50 rounded-2xl group focus-within:ring-2 focus-within:ring-blue-500 transition-all border border-blue-100/50">
            <i className="fas fa-building text-blue-400 mr-3 group-focus-within:text-blue-600"></i>
            <input
              type="text"
              value={referenceCompany}
              onChange={(e) => setReferenceCompany(e.target.value)}
              placeholder="对标公司 (可选，若不填行业则根据此公司分析)"
              className="bg-transparent border-none outline-none w-full text-slate-700 placeholder:text-blue-300 font-medium"
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center px-5 py-3 bg-slate-50 rounded-2xl group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <i className="fas fa-users text-slate-400 mr-3 group-focus-within:text-blue-500"></i>
            <div className="flex flex-col flex-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold leading-none mb-1">人数规模</span>
              <select 
                value={size} 
                onChange={(e) => setSize(e.target.value)}
                className="bg-transparent border-none outline-none w-full text-slate-700 font-bold text-sm"
                disabled={isLoading}
              >
                <option value="all">不限规模</option>
                <option value="micro">微型 (1-50人)</option>
                <option value="small">小型 (50-200人)</option>
                <option value="medium">中型 (200-1000人)</option>
                <option value="large">大型 (1000人以上)</option>
                <option value="giant">巨型 (5000人以上)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center px-5 py-3 bg-slate-50 rounded-2xl group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <i className="fas fa-list-ol text-slate-400 mr-3 group-focus-within:text-blue-500"></i>
            <div className="flex flex-col flex-1">
              <span className="text-[10px] uppercase text-slate-400 font-bold leading-none mb-1">检索数量 (1-100)</span>
              <input
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                className="bg-transparent border-none outline-none w-full text-slate-700 font-bold"
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-4 rounded-2xl font-black text-lg text-white transition-all flex items-center justify-center gap-3 ${
            !canSubmit
              ? 'bg-slate-300 cursor-not-allowed opacity-60'
              : 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:shadow-2xl hover:shadow-blue-200 active:scale-[0.98]'
          }`}
        >
          {isLoading ? (
            <i className="fas fa-atom animate-spin"></i>
          ) : (
            <i className="fas fa-brain"></i>
          )}
          <span>{isLoading ? '正在分析对标逻辑' : '生成深度研究报告'}</span>
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-400 px-3 justify-center">
        <span><i className="fas fa-lightbulb mr-1 text-yellow-500"></i> 提示：若未填行业，将自动解析对标公司的业务模型</span>
        <span><i className="fab fa-linkedin mr-1 text-blue-500"></i> LinkedIn 动态核实</span>
        <span><i className="fas fa-file-contract mr-1 text-orange-500"></i> 合成 5+ 份行业报告</span>
        <span><i className="fas fa-sort-amount-down mr-1 text-green-500"></i> 按营收严格排序</span>
      </div>
    </div>
  );
};

export default SearchBar;
