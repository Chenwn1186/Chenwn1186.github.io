import { useMemo } from 'react';
import { BRAND_CN, brandColor, type Lens } from '../domain/lens';
import { SectionHead } from '@platform/ui/ui';

export function NotesSection({ data }: { data: Lens[] }) {
  const brands = useMemo(() => {
    const c = new Map<string, number>();
    for (const d of data) c.set(d.brand, (c.get(d.brand) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  return (
    <section className="mt-7.5">
      <SectionHead no={6} title="数据说明" />

      <ul className="rounded-[10px] border border-line bg-card px-4.5 py-4 text-[12.5px] text-tx2">
        {[
          <>
            <b className="text-tx">数据口径</b>：每个分项为 dcaid.com 聚合多家专业评测站后的
            <b className="text-tx">均值</b>，0–10 分制。不同镜头、不同分项之间口径一致，可直接比较。
          </>,
          <>
            <b className="text-tx">低置信度标记</b>：评测源少于 3 家，或分数全为整数（说明仅单一来源）的型号，
            表格中显示 <span className="text-[#B07A22]">⚠ 低置信度</span>，图表中以
            <b className="text-tx">虚线 / 半透明</b>呈现。方向可参考，绝对值请打折。
          </>,
          <>
            <b className="text-tx">价格为参考值</b>：按 dcaid 收录的 MSRP（美元）折算人民币，
            未含关税与渠道加价，只用于量级比较，请以实际售价为准。
          </>,
          <>
            <b className="text-tx">「—」含义</b>：该镜头无此分项评分（多为样本不足），并非记为 0 分。
            筛选时这类镜头会被评分下限条件排除。
          </>,
          <>
            <b className="text-tx">焦段筛选</b>：默认「完全落在区间内」，可切换为「与区间有交集」
            以纳入覆盖该段的长变焦。
          </>,
          <>
            <b className="text-tx">品牌名称</b>：全部品牌均按「英文名（官方中文名）」标注。
            中文名取自品牌方官网与官方电商旗舰店，确无官方中文名的品牌（如 GIZMON）标注为「无官方译名」。
            完整对照见下方。
          </>,
        ].map((li, i) => (
          <li key={i} className="my-1.25 ml-4.5 list-disc">
            {li}
          </li>
        ))}
      </ul>

      <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-x-3.5 gap-y-1.25 border-t border-line2 pt-3.5 text-[11.5px] text-tx2">
        {brands.map(([b, c]) => (
          <span key={b} title={b} className="flex items-center gap-1.5 overflow-hidden">
            <i className="size-2 flex-none rounded-[2px]" style={{ background: brandColor(b) }} />
            <span className="truncate">{b}</span>
            <em className="text-[10.5px] font-normal not-italic text-tx3">
              {BRAND_CN[b] ?? '无官方译名'}
            </em>
            <em className="ml-auto text-[10.5px] font-normal not-italic text-tx3">{c}</em>
          </span>
        ))}
      </div>
    </section>
  );
}
