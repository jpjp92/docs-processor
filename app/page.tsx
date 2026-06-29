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
        <h1 id="launcher-title">작업을 선택하세요</h1>
        <p>PDF를 읽고 분석하거나, 이미지 묶음을 검토된 Word 문서로 정리합니다.</p>
      </section>

      <section className="launcher-grid" aria-label="작업 선택">
        <Link className="launcher-card pdf" href="/pdf">
          <span className="launcher-icon" aria-hidden="true">
            <FileText size={24} />
          </span>
          <span className="launcher-copy">
            <strong>PDF 분석</strong>
            <span>PDF를 열고 영역 선택, 요약, AI 질의를 진행합니다.</span>
          </span>
          <ArrowRight className="launcher-arrow" size={20} aria-hidden="true" />
        </Link>

        <Link className="launcher-card refine" href="/refine">
          <span className="launcher-icon" aria-hidden="true">
            <Images size={24} />
          </span>
          <span className="launcher-copy">
            <strong>이미지 → Word 문서</strong>
            <span>여러 이미지를 OCR·검토한 뒤 docx로 생성합니다.</span>
          </span>
          <ArrowRight className="launcher-arrow" size={20} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
