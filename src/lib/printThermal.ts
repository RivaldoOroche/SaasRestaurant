// Imprime el .print-area en formato de ticket térmico 80mm. El tamaño de página
// (@page) no se puede condicionar por clase, así que se inyecta al vuelo y se
// limpia después de imprimir.
export function printThermal(): void {
  const style = document.createElement("style");
  style.setAttribute("data-thermal", "");
  style.textContent = "@page { size: 80mm auto; margin: 4mm; }";
  document.head.appendChild(style);
  document.body.classList.add("print-80");

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.body.classList.remove("print-80");
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Respaldo por si afterprint no dispara (algunos navegadores).
  setTimeout(cleanup, 1500);
}
