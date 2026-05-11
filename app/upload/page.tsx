import { UploadForm } from "./upload-form";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-copper">Transcript ingestion</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Turn raw calls into durable memory.</h1>
      </header>
      <UploadForm />
    </div>
  );
}
