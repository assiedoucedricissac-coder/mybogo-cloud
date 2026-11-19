import { useRef, useState, useCallback } from 'react';

// Permet de déplacer une fenêtre modale en la glissant par son en-tête.
// Retourne un offset {x,y} à composer avec le positionnement centré par défaut
// (transform: translateX(-50%) translate(offset.x, offset.y)), et un handler
// à poser en onMouseDown sur la barre d'en-tête de la modale.
export function useDraggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  const onMouseDown = useCallback((e) => {
    // Ignore les clics sur les boutons/contrôles de l'en-tête (ex: bouton fermer)
    if (e.target.closest('button, input, select, textarea, a')) return;
    drag.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
    const onMove = (ev) => {
      if (!drag.current) return;
      setOffset({
        x: drag.current.origX + (ev.clientX - drag.current.startX),
        y: drag.current.origY + (ev.clientY - drag.current.startY),
      });
    };
    const onUp = () => {
      drag.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [offset]);

  return { offset, onMouseDown };
}
