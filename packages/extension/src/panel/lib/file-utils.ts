export async function saveImageToFile(dataUrl: string | undefined) {
    if (!dataUrl) return;
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: "screenshot-" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".png",
            types: [{ description: "PNG images", accept: { "image/png": [".png"] } }],
        });
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
    } catch (e: unknown) {
        if (e instanceof Error && e.name !== "AbortError") console.error("Save failed:", e);
    }
}