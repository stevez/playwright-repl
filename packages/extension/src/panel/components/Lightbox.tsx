import { saveImageToFile } from '@/lib/file-utils';

interface LightboxProps {
    image: string
    onClose: () => void;
}
function Lightbox({image, onClose} :LightboxProps) {
    return (
        <div id="lightbox">
            <button id="lightbox-close-btn" onClick={onClose}>&times;</button>
            <button id="lightbox-save-btn" onClick={() => saveImageToFile(image)}>Save</button>
            <img id="lightbox-img" src={image}/>
        </div>
    );
}

export default Lightbox;