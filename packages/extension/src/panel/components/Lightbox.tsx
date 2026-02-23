function Lightbox() {
    return (
        <div id="lightbox" hidden>
            <button id="lightbox-close-btn">&times;</button>
            <button id="lightbox-save-btn">Save</button>
            <img id="lightbox-img" />
        </div>
    );
}

export default Lightbox;