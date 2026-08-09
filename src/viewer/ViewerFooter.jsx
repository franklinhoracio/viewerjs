import React from "react";

export default function ViewerFooter({ publicConfig }) {
  return (
    <p className="footnote">
      <div className="sl-footer">
        <a
          href={`https://wa.me/${publicConfig.whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="sl-whatsappChip"
        >
          <span>WhatsApp {publicConfig.whatsappLabel}</span>
        </a>
      </div>
      <br />
    </p>
  );
}
