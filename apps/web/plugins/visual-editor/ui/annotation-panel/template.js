import { ICON_DELETE, ICON_CLOSE, ICON_PAPER_CLIP } from '../../constants/icons.js';

export const ANNOTATION_PANEL_HTML = `
<div id="selection-mode-annotation-panel">
	<div id="selection-mode-annotation-header">
		<span id="selection-mode-annotation-count"></span>
		<button id="selection-mode-discard-btn" title="Close">${ICON_CLOSE}</button>
	</div>
	<div id="selection-mode-annotation-attachments"></div>
	<textarea id="selection-mode-annotation-textarea" placeholder="Tell AI what to change" rows="1"></textarea>
	<div id="selection-mode-annotation-buttons">
		<div id="selection-mode-annotation-actions">
			<div id="selection-mode-delete-wrapper">
				<button id="selection-mode-delete-btn" title="Delete comment">${ICON_DELETE}</button>
			</div>
			<button id="selection-mode-attach-image-btn" title="Attach image">${ICON_PAPER_CLIP}</button>
		</div>
		<button id="selection-mode-comment-btn" disabled>Add comment</button>
	</div>
</div>
`;
