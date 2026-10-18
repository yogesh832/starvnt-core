import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { external } from "./runtime";
import type { Client } from './client';

export async function shareReport(api: Client) {
  const response = await api.download('/reports/summary/export.csv');
  const file = new File(Paths.cache, `starvnt-report-summary-${Date.now()}.csv`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(await response.arrayBuffer()));
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values' });
}

export async function shareDocument(documentId: string) {
  let response = await external.download(
    `/customer/documents/${encodeURIComponent(documentId)}/download`,
  );
  if (response.headers.get("content-type")?.includes("application/json")) {
    const { downloadUrl } = await response.json();
    if (typeof downloadUrl !== "string" || !downloadUrl.startsWith("https://"))
      throw new Error("A secure document link is required.");
    response = await fetch(downloadUrl, { credentials: "omit" });
    if (!response.ok)
      throw new Error(
        "This document could not be downloaded. Please try again.",
      );
  }
  const file = new File(
    Paths.cache,
    `starvnt-${documentId.replace(/[^a-z0-9_-]/gi, "")}.pdf`,
  );
  file.create({ overwrite: true });
  file.write(new Uint8Array(await response.arrayBuffer()));
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is not available on this device.");
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  });
}
