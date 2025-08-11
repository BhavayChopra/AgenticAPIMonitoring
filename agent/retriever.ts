/*
  API Sentinel — Hybrid Retriever
  Graph filtering + FAISS/BM25 passage ranking.
*/

import fs from "fs";
import path from "path";
import { DocNode, RetrieverPassage, RetrieverResult } from "./types";

type EncodeFn = (text: string) => Promise<number[]>;

export interface VectorIndex {
  add(documentId: string, vectors: number[][], texts: string[], offsets: [number, number][]): Promise<void>;
  search(queryVector: number[], k: number): Promise<{ docId: string; passageId: string; score: number }[]>;
}

// Minimal FAISS wrapper via python child process (optional). Fallback to BM25.
export class DummyVectorIndex implements VectorIndex {
  private store: Array<{
    docId: string;
    passageId: string;
    vector: number[];
    text: string;
    offsets: [number, number];
  }> = [];

  async add(documentId: string, vectors: number[][], texts: string[], offsets: [number, number][]): Promise<void> {
    for (let i = 0; i < vectors.length; i++) {
      this.store.push({
        docId: documentId,
        passageId: `${documentId}#${i}`,
        vector: vectors[i],
        text: texts[i],
        offsets: offsets[i],
      });
    }
  }

  async search(queryVector: number[], k: number) {
    // Cosine similarity naive
    const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    const qn = norm(queryVector) || 1e-9;
    const scored = this.store.map((e) => {
      const dot = e.vector.reduce((s, x, i) => s + x * (queryVector[i] ?? 0), 0);
      const en = norm(e.vector) || 1e-9;
      return { docId: e.docId, passageId: e.passageId, score: dot / (qn * en) };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

export class HybridRetriever {
  private index: VectorIndex;
  private encode: EncodeFn;
  private maxEvidence: number;

  constructor(options?: { index?: VectorIndex; encode?: EncodeFn; maxEvidence?: number }) {
    this.index = options?.index ?? new DummyVectorIndex();
    this.encode =
      options?.encode ?? (async (t: string) => this.simpleHashEmbedding(t));
    this.maxEvidence = options?.maxEvidence ?? Number(process.env.MAX_EVIDENCE ?? 6);
  }

  async buildIndexFromDocs(docs: DocNode[], passageChars: number = 1200): Promise<void> {
    for (const d of docs) {
      const { chunks, offsets } = this.splitIntoPassages(d.content, passageChars);
      const vectors: number[][] = [];
      for (const text of chunks) {
        vectors.push(await this.encode(text));
      }
      await this.index.add(d.id, vectors, chunks, offsets);
    }
  }

  async retrieve(question: string, docs: DocNode[]): Promise<RetrieverResult> {
    if (!docs.length) {
      return { passages: [], usedBm25: true, usedVector: false };
    }
    await this.buildIndexFromDocs(docs);
    const qVec = await this.encode(question);
    const vectorHits = await this.index.search(qVec, this.maxEvidence * 3);

    // Collect candidate passages with text/offsets by re-splitting docs
    const passageMap: Record<string, { text: string; start: number; end: number; docId: string }> = {};
    for (const d of docs) {
      const { chunks, offsets } = this.splitIntoPassages(d.content, 1200);
      for (let i = 0; i < chunks.length; i++) {
        const pid = `${d.id}#${i}`;
        passageMap[pid] = { text: chunks[i], start: offsets[i][0], end: offsets[i][1], docId: d.id };
      }
    }

    // Merge: if vectorHits empty, fall back to BM25
    let results: Array<{ pid: string; score: number }> = [];
    if (vectorHits.length === 0) {
      const bm25 = this.simpleBM25(question, Object.values(passageMap).map((p) => p.text));
      results = bm25.slice(0, this.maxEvidence).map((r, i) => ({ pid: `${docs[0].id}#${i}`, score: r.score }));
      return {
        passages: results
          .map((r) => {
            const p = passageMap[r.pid];
            return {
              docId: p.docId,
              passageId: r.pid,
              text: p.text,
              startOffset: p.start,
              endOffset: p.end,
              score: r.score,
            } as RetrieverPassage;
          })
          .slice(0, this.maxEvidence),
        usedBm25: true,
        usedVector: false,
      };
    }

    const merged = vectorHits
      .map((h) => ({ pid: h.passageId, score: h.score }))
      .filter((r) => passageMap[r.pid])
      .slice(0, this.maxEvidence);

    const passages: RetrieverPassage[] = merged.map((r) => {
      const p = passageMap[r.pid];
      return {
        docId: p.docId,
        passageId: r.pid,
        text: p.text,
        startOffset: p.start,
        endOffset: p.end,
        score: r.score,
      };
    });
    return { passages, usedBm25: false, usedVector: true };
  }

  private splitIntoPassages(text: string, chunkChars: number): { chunks: string[]; offsets: [number, number][] } {
    const chunks: string[] = [];
    const offsets: [number, number][] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkChars, text.length);
      chunks.push(text.slice(start, end));
      offsets.push([start, end]);
      start = end;
    }
    return { chunks, offsets };
  }

  // Deterministic hashing-based embedding substitute (placeholder)
  private simpleHashEmbedding(text: string, dim: number = 256): number[] {
    const vec = new Array<number>(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      const idx = ch % dim;
      vec[idx] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1e-9;
    return vec.map((x) => x / norm);
  }

  private simpleBM25(query: string, passages: string[]): Array<{ index: number; score: number }> {
    const qTokens = this.tokenize(query);
    const docsTokens = passages.map((p) => this.tokenize(p));
    const N = passages.length;
    const df: Record<string, number> = {};
    for (const tokens of docsTokens) {
      const unique = new Set(tokens);
      for (const t of unique) df[t] = (df[t] ?? 0) + 1;
    }
    const avgdl = docsTokens.reduce((s, d) => s + d.length, 0) / Math.max(1, N);
    const k1 = 1.5;
    const b = 0.75;
    const scores: number[] = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const tokens = docsTokens[i];
      const tf: Record<string, number> = {};
      for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
      const dl = tokens.length;
      for (const t of qTokens) {
        const n = df[t] ?? 0.5; // smoothing
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        const f = tf[t] ?? 0;
        const denom = f + k1 * (1 - b + (b * dl) / (avgdl || 1));
        scores[i] += idf * ((f * (k1 + 1)) / (denom || 1e-9));
      }
    }
    const ranked = scores
      .map((score, index) => ({ index, score }))
      .sort((a, b) => b.score - a.score);
    return ranked;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9_/.-]+/g, " ").split(/\s+/).filter(Boolean);
  }
}


