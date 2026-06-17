window.ANTONY_WHATSAPP_NUMBER = "18299104940";

window.antonyWhatsappUrl = function antonyWhatsappUrl(message) {
  const encoded = encodeURIComponent(message);
  return window.ANTONY_WHATSAPP_NUMBER
    ? `https://wa.me/${window.ANTONY_WHATSAPP_NUMBER}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
};
