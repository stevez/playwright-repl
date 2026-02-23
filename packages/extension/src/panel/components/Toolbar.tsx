function Toolbar() {
    return(
        <div id="toolbar">
            <div id="toolbar-left">
                <button id="open-btn" title="Open .pw file">Open</button>
                <button id="save-btn" title="Save as .pw file" disabled>Save</button>
                <button id="copy-btn" title="Copy editor content" disabled>Copy</button>
                <span className="toolbar-sep"></span>
                <button id="record-btn" title="Toggle recording">&#9210; Record</button>
                <button id="run-btn" title="Run script (Ctrl+Enter)">&#9654;</button>
                <button id="step-btn" title="Step: run next line">&#9655;</button>
                <button id="export-btn" title="Export as Playwright test" disabled>Export</button>
            </div>
            <div id="toolbar-right">
                <span id="file-info"></span>
            </div>
        </div>
    )
}

export default Toolbar;