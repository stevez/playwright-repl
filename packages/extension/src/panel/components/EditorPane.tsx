function EditorPane() {
    return (
        <div id="editor-pane">
            <div id="line-numbers"></div>
            <div id="editor-wrapper">
                <div id="line-highlight"></div>
                <textarea
                    id="editor"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="# Type or open a .pw script...">
                </textarea>
            </div>
        </div>
    )
}

export default EditorPane;