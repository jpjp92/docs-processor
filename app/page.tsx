import { ArrowRight, FileText, Images } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="launcher-shell">
      <section className="launcher-head" aria-labelledby="launcher-title">
        <div className="launcher-brand">
          <span className="dot" />
          <span>Verso</span>
        </div>
        <div className="launcher-kicker">Document workspace</div>
        <h1 id="launcher-title">
          읽고, 정리하고,
          <br />
          리포트까지
        </h1>
        <p>PDF는 요약·리포트로, 이미지는 읽어 Word 문서로 정리합니다.</p>
      </section>

      <section className="launcher-grid" aria-label="작업 선택">
        <Link className="launcher-card pdf" href="/pdf">
          <span className="launcher-icon" aria-hidden="true">
            <FileText size={24} />
          </span>
          <span className="launcher-copy">
            <strong>PDF 분석</strong>
            <span>영역 선택, 요약, 리포트 생성.</span>
          </span>
          <ArrowRight className="launcher-arrow" size={20} aria-hidden="true" />
        </Link>

        <Link className="launcher-card refine" href="/refine">
          <span className="launcher-icon" aria-hidden="true">
            <Images size={24} />
          </span>
          <span className="launcher-copy">
            <strong>이미지 문서화</strong>
            <span>OCR, 통합 검토, Word 생성.</span>
          </span>
          <ArrowRight className="launcher-arrow" size={20} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
