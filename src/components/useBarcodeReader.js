"use client";

// One-shot camera barcode reader: start the camera while `active`, read
// frames with zxing-wasm, and hand back the first whole barcode. Same reader
// and settings as the /scan Barcode tab (see BarcodeScan in CoverScanner.js
// for why zxing-wasm and not BarcodeDetector or @zxing/library), minus the
// stack-scanning queue, which a single library copy does not need.

import { useEffect, useRef, useState } from "react";
import { barcodeHasSupplement, combineBarcodeParts, ZXING_WASM_VERSION } from "@/lib/printings";

export function useBarcodeReader({ active, onUpc }) {
  const videoRef = useRef(null);
  const onUpcRef = useRef(onUpc);
  const [cameraState, setCameraState] = useState("idle");

  useEffect(() => {
    onUpcRef.current = onUpc;
  }, [onUpc]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let stream = null;
    let frameTimer = null;
    let windowTimer = null;
    let values = [];

    const stop = () => {
      cancelled = true;
      clearTimeout(frameTimer);
      clearTimeout(windowTimer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    // The 5-digit add-on often decodes a few frames after the main code, so
    // a window without it waits once more before settling for the main code.
    const flush = (extended) => {
      if (cancelled) return;
      if (!extended && !barcodeHasSupplement(values)) {
        windowTimer = setTimeout(() => flush(true), 1500);
        return;
      }
      const upc = combineBarcodeParts(values);
      values = [];
      windowTimer = null;
      if (!upc) return;
      navigator.vibrate?.(45);
      stop();
      onUpcRef.current?.(upc);
    };

    async function start() {
      setCameraState("starting");
      if (!navigator.mediaDevices?.getUserMedia) { setCameraState("unavailable"); return; }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        videoRef.current.srcObject = media;
        await videoRef.current.play();
        if (cancelled) return;
        setCameraState("ready");
        const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
        prepareZXingModule({ overrides: { locateFile: (path, prefix) => path.endsWith(".wasm") ? `/zxing-reader-${ZXING_WASM_VERSION}.wasm` : prefix + path } });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const detect = async () => {
          const frame = videoRef.current;
          if (cancelled || !frame) return;
          if (frame.videoWidth) {
            canvas.width = frame.videoWidth;
            canvas.height = frame.videoHeight;
            context.drawImage(frame, 0, 0);
            try {
              const found = await readBarcodes(context.getImageData(0, 0, canvas.width, canvas.height), {
                formats: ["UPCA", "EAN13"], eanAddOnSymbol: "Read", tryHarder: true, maxNumberOfSymbols: 1,
              });
              if (found.length && !cancelled) {
                values.push(...found.map((item) => item.text));
                if (!windowTimer) windowTimer = setTimeout(() => flush(false), 1000);
              }
            } catch (error) {
              console.warn("Barcode detection failed", error);
            }
          }
          if (!cancelled) frameTimer = setTimeout(detect, 150);
        };
        detect();
      } catch (error) {
        if (cancelled) return;
        setCameraState(error?.name === "NotAllowedError" || error?.name === "SecurityError" ? "denied" : "unavailable");
      }
    }

    start();
    return stop;
  }, [active]);

  return { videoRef, cameraState };
}
