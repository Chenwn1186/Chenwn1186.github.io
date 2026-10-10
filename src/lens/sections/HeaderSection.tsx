import { useMemo } from 'react';
import { fmt, type Lens } from '@/shared/lib/lens';
import { Stat } from '@/shared/components/ui';

export function HeaderSection({ data }: { data: Lens[] }) {
  const s = useMemo(() => {
    const srcSet = new Set<string>();
    let scored = 0;
    let bestScore: number | null = null;
    let withSpec = 0;
    const brands = new Set<string>();
    const mounts = new Set<string>();

    for (const d of data) {
      if (d.sources) for (const x of d.sources) srcSet.add(x);
      brands.add(d.brand);
      if (d.mount) mounts.add(d.mount);
      if (d.overall != null) {
        scored++;
        if (bestScore === null || d.overall > bestScore) bestScore = d.overall;
      }
      if (d.filterSize || d.weight) withSpec++;
    }
    return {
      total: data.length,
      brands: brands.size,
      mounts: mounts.size,
      sources: srcSet.size,
      scored,
      best: bestScore,
      withSpec,
    };
  }, [data]);

  return (
    <header className="border-b border-line pt-7.5 pb-5">
      <h1 className="text-[24px] font-semibold tracking-[-0.3px] max-sm:text-[19px]">
        全球镜头评测数据库
      </h1>
      <p className="mt-1.75 max-w-[900px] text-[13.5px] text-tx2">
        收录 <b>{s.total.toLocaleString('en-US')}</b> 支镜头，每支含 <b>8 项</b>
        实测评测分项（中心/边缘锐度、暗角、横向/轴向色差、畸变、抗眩光、焦外），
        以及卡口、焦段、光圈、滤镜口径、最近对焦、光圈叶片、重量、结构等完整规格。
        全部数据来自第三方专业评测站实测评分聚合，可自由筛选、排序、导出与逐支对比。
      </p>
      <p className="mt-2 text-[12px] text-tx3">
        数据源：
        <a
          href="https://dcaid.com/lenses/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-tx2 underline decoration-dotted underline-offset-2 hover:text-acc"
        >
          dcaid.com
        </a>
        {' '}—— 聚合 <b>{s.sources}</b> 家专业评测媒体（SonyAlpha / OpticalLimits / Lenstip /
        PhillipReeve / DCWatch / Fstoppers / DPReview / Cameralabs 等）的实测分项评分。
        分数为多站均值，0–10 分制，非厂商标称值。
      </p>

      <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-2.5">
        <Stat k={s.total.toLocaleString('en-US')} l="收录镜头" />
        <Stat k={s.brands} l="个品牌" />
        <Stat k={s.mounts} l="种卡口" />
        <Stat k={s.sources} l="家评测源" />
        <Stat k="8" l="评测维度" />
        <Stat k={s.best != null ? fmt(s.best) : '—'} l="最高综合分" />
        <Stat k={s.withSpec.toLocaleString('en-US')} l="含完整规格" />
      </div>
    </header>
  );
}
