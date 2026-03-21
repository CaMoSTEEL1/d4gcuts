import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const FETCH_TIMEOUT = 15_000;

const services = [
  {
    name: "Full Cut",
    price: 30,
    desc: "Scissor or clipper work, clean fade, and a finished edge-up. Every detail locked in before you leave the chair.",
  },
  {
    name: "Lineup",
    price: 15,
    desc: "Sharp hairline, defined edges, and a fresh beard line. The 15-minute reset that changes the whole look.",
  },
  {
    name: "Mobile",
    price: 50,
    desc: "Russ comes to you. Same premium cut at your location. Available within a 10-mile radius — just drop the address when you book.",
  },
];

const galleryImages = [
  "/display-cuts/IMG_8740.jpg",
  "/display-cuts/IMG_8741.jpg",
  "/display-cuts/IMG_8743.jpg",
  "/display-cuts/IMG_8744.jpg",
  "/display-cuts/IMG_8747.jpg",
  "/display-cuts/IMG_8748.jpg",
  "/display-cuts/IMG_8749.jpg",
  "/display-cuts/IMG_8780.jpg",
  "/display-cuts/IMG_8781.jpg",
  "/display-cuts/IMG_8782.jpg",
  "/display-cuts/IMG_8801.jpg",
  "/display-cuts/IMG_8802.jpg",
  "/display-cuts/IMG_8803.jpg",
  "/display-cuts/IMG_8804.jpg",
];

const formatTimeEST = (time24) => {
  const [h = "0", m = "0"] = String(time24 || "00:00").split(":");
  const hour = Number(h);
  const minute = Number(m);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix} EST`;
};

const formatSlot = (slot) =>
  `${slot.date} · ${formatTimeEST(slot.start_time)}–${formatTimeEST(slot.end_time)}`;

const safeFetch = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw e;
  }
};

const ok = (msg) => `ok:${msg}`;
const err = (msg) => `err:${msg}`;
const statusClass = (s) => {
  if (!s) return "";
  if (s.startsWith("ok:")) return "status-ok";
  if (s.startsWith("err:")) return "status-err";
  return "status-info";
};
const statusText = (s) => (s ? s.replace(/^(ok:|err:)/, "") : "");

// Scroll-reveal via IntersectionObserver
function useReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("visible");
        });
      },
      { threshold: 0.07, rootMargin: "0px 0px -48px 0px" }
    );
    document.querySelectorAll(".reveal, .reveal-left, .stagger").forEach((el) =>
      observer.observe(el)
    );
    return () => observer.disconnect();
  }, []);
}

function StarRating({ rating }) {
  return (
    <span className="review-stars" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="review-star" aria-hidden="true">
          {i < rating ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

// Booking confirmation panel shown after a successful booking
function BookingConfirmed({ booking, onPayNow, onDismiss, paymentLoading }) {
  const svc = services.find((s) => s.name === booking.service);
  return (
    <div className="booking-confirmed">
      <div className="confirmed-check" aria-hidden="true">✓</div>
      <div className="confirmed-label">Booking Confirmed</div>
      <h3 className="confirmed-service">{booking.service}</h3>
      <p className="confirmed-detail">
        {booking.date} · {formatTimeEST(booking.start_time)}
      </p>
      <p className="confirmed-greeting">
        See you then, {booking.customer_name.split(" ")[0]}.
      </p>
      <div className="confirmed-actions">
        <button
          className="btn-primary"
          onClick={onPayNow}
          disabled={paymentLoading}
        >
          {paymentLoading ? "Redirecting to payment…" : `Pay Now — $${svc?.price ?? "—"}`}
        </button>
        <button className="btn-ghost" onClick={onDismiss}>
          Pay at Appointment
        </button>
      </div>
      <p className="confirmed-note">
        A confirmation was sent to {booking.customer_email}. If paying online,
        you&apos;ll be redirected to Stripe&apos;s secure checkout.
      </p>
    </div>
  );
}

export default function App() {
  useReveal();

  const [token] = useState(() => localStorage.getItem("token") || "");
  const [user] = useState(() => {
    try {
      const s = localStorage.getItem("user");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  // Nav
  const [navOpen, setNavOpen] = useState(false);

  // Booking
  const [availability, setAvailability] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [selectedService, setSelectedService] = useState(services[0]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [bookingStatus, setBookingStatus] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "" });
  const [mobileAddress, setMobileAddress] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Reviews
  const [reviews, setReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [reviewStatus, setReviewStatus] = useState("");

  // Gallery lightbox
  const [lightboxImage, setLightboxImage] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const closeBtnRef = useRef(null);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const fetchAvailability = useCallback(async (dateFilter = "") => {
    setLoadingSlots(true);
    setSlotsError(false);
    try {
      const query = dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : "";
      const res = await safeFetch(`${API_BASE}/availability/open${query}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setAvailability(data);
    } catch (e) {
      console.error("Failed to fetch availability:", e.message);
      setSlotsError(true);
      setAvailability([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await safeFetch(`${API_BASE}/reviews`);
      if (!res.ok) throw new Error("Failed to load reviews");
      const data = await res.json();
      setReviews(data);
    } catch (e) {
      console.error("Failed to fetch reviews:", e.message);
    }
  }, []);

  // Check for Stripe redirect result on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success") {
      setBookingStatus(ok("Payment confirmed! You're all set — see you at your appointment."));
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => document.querySelector("#book")?.scrollIntoView({ behavior: "smooth" }), 400);
    } else if (payment === "cancelled") {
      setBookingStatus(err("Payment cancelled. Your slot is still reserved — you can pay at your appointment."));
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => document.querySelector("#book")?.scrollIntoView({ behavior: "smooth" }), 400);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    if (selectedDate) fetchAvailability(selectedDate);
  }, [selectedDate, fetchAvailability]);

  // Focus lightbox close button on open
  useEffect(() => {
    if (lightboxImage) closeBtnRef.current?.focus();
  }, [lightboxImage]);

  // Escape key closes lightbox
  useEffect(() => {
    if (!lightboxImage) return;
    const handleKey = (e) => { if (e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxImage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = navOpen || lightboxImage ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [navOpen, lightboxImage]);

  const openLightbox = (img, idx) => { setLightboxImage(img); setLightboxIndex(idx); };
  const closeLightbox = () => { setLightboxImage(""); setLightboxIndex(null); };

  const scrollTo = (id) => {
    setNavOpen(false);
    setTimeout(() => document.querySelector(id)?.scrollIntoView({ behavior: "smooth" }), navOpen ? 350 : 0);
  };

  const handleBooking = async () => {
    if (!customerForm.name.trim() || !customerForm.email.trim()) {
      setBookingStatus(err("Please enter your name and email."));
      return;
    }
    if (!selectedSlot) {
      setBookingStatus(err("Select an available time slot."));
      return;
    }
    if (selectedService.name === "Mobile" && !mobileAddress.trim()) {
      setBookingStatus(err("Add a service address for mobile bookings."));
      return;
    }

    setBookingLoading(true);
    setBookingStatus("");
    try {
      const res = await safeFetch(`${API_BASE}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          availability_id: selectedSlot.id,
          service: selectedService.name,
          customer_name: customerForm.name.trim(),
          customer_email: customerForm.email.trim(),
          customer_phone: customerForm.phone.trim(),
          address: selectedService.name === "Mobile" ? mobileAddress.trim() : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingStatus(err(data.message || "Booking failed."));
        return;
      }
      // Show the confirmation + payment panel
      setConfirmedBooking(data);
      setSelectedSlot(null);
      setCustomerForm({ name: "", email: "", phone: "" });
      setMobileAddress("");
      fetchAvailability(selectedDate);
    } catch (e) {
      setBookingStatus(err(e.message || "Something went wrong. Please try again."));
    } finally {
      setBookingLoading(false);
    }
  };

  const handlePayNow = async () => {
    if (!confirmedBooking) return;
    setPaymentLoading(true);
    try {
      const res = await safeFetch(`${API_BASE}/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: confirmedBooking.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingStatus(err(data.message || "Payment setup failed. You can pay at your appointment."));
        return;
      }
      // Redirect to Stripe-hosted checkout
      window.location.href = data.url;
    } catch (e) {
      setBookingStatus(err("Payment unavailable. You can pay cash at your appointment."));
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!token) { setReviewStatus(err("Log in to leave a review.")); return; }
    if (!reviewForm.comment.trim()) { setReviewStatus(err("Add a note before submitting.")); return; }
    try {
      const res = await safeFetch(`${API_BASE}/reviews`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(reviewForm),
      });
      const data = await res.json();
      if (!res.ok) { setReviewStatus(err(data.message || "Review failed.")); return; }
      setReviewForm({ rating: 5, comment: "" });
      setReviewStatus(ok("Review submitted. Thank you!"));
      fetchReviews();
    } catch (e) {
      setReviewStatus(err(e.message || "Failed to submit review."));
    }
  };

  return (
    <div className="page">
      <a href="#main-content" className="skip-link">Skip to content</a>

      {/* ══ HERO ══ */}
      <header className="hero" style={{ backgroundImage: "url(/background.jpg)" }}>
        <div className="hero-overlay" aria-hidden="true" />

        <nav className="nav" aria-label="Main navigation">
          <a href="/" className="nav-logo">
            <img src="/IMG_7755.png" alt="" width="30" height="30" aria-hidden="true" />
            d4gcutz
          </a>

          <ul className="nav-links">
            {[["#services","Services"],["#book","Book"],["#barber","Russ"],["#gallery","Gallery"],["#reviews","Reviews"]].map(
              ([href, label]) => (
                <li key={href}>
                  <a href={href} onClick={(e) => { e.preventDefault(); scrollTo(href); }}>
                    {label}
                  </a>
                </li>
              )
            )}
          </ul>

          <button className="nav-cta" onClick={() => scrollTo("#book")}>Book Now</button>

          <button
            className={`nav-hamburger${navOpen ? " open" : ""}`}
            onClick={() => setNavOpen((p) => !p)}
            aria-expanded={navOpen}
            aria-controls="mobile-nav"
            aria-label={navOpen ? "Close menu" : "Open menu"}
          >
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </nav>

        <div id="mobile-nav" className={`nav-drawer${navOpen ? " open" : ""}`} aria-hidden={!navOpen}>
          {[["#services","Services"],["#book","Book"],["#barber","Russ"],["#gallery","Gallery"],["#reviews","Reviews"]].map(
            ([href, label]) => (
              <a key={href} href={href} tabIndex={navOpen ? 0 : -1}
                onClick={(e) => { e.preventDefault(); scrollTo(href); }}>{label}</a>
            )
          )}
        </div>

        <div className="hero-content" id="main-content">
          <p className="hero-eyebrow">Best Cutz in the &apos;ville &middot; Book with Russ</p>
          <h1 className="hero-title">
            <span className="block">Refresh</span>
            <span className="block">That <span className="accent">Inner</span></span>
            <span className="block">DAWG</span>
          </h1>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => scrollTo("#book")}>Book a Session</button>
            <button className="btn-ghost" onClick={() => scrollTo("#barber")}>Meet Russ</button>
          </div>
        </div>

        <p className="hero-scroll-hint" aria-hidden="true"><span />Scroll</p>
      </header>

      {/* ══ SERVICES ══ */}
      <section className="section services" id="services" aria-labelledby="services-title">
        <div className="section-header reveal">
          <span className="section-label">What We Offer</span>
          <h2 className="section-title" id="services-title">Precision Services</h2>
        </div>
        <div className="service-list stagger">
          {services.map((service, i) => (
            <div key={service.name} className="service-item">
              <span className="service-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <div className="service-body">
                <h3>{service.name}</h3>
                <p>{service.desc}</p>
              </div>
              <span className="service-price" aria-label={`$${service.price}`}>${service.price}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ══ BOOKING ══ */}
      <section className="section booking" id="book" aria-labelledby="book-title">
        <div className="booking-inner">
          <div className="booking-panel">
            <div className="section-header reveal">
              <span className="section-label">Schedule</span>
              <h2 className="section-title" id="book-title">Book Your Session</h2>
              <p className="section-desc">Pick a service, find an open slot, and lock it in.</p>
            </div>

            {/* Payment redirect status (from Stripe return) */}
            {bookingStatus && !confirmedBooking && (
              <p className={statusClass(bookingStatus)} role="status" style={{ marginBottom: "1.5rem" }}>
                {statusText(bookingStatus)}
              </p>
            )}

            {/* Booking confirmation panel */}
            {confirmedBooking ? (
              <BookingConfirmed
                booking={confirmedBooking}
                onPayNow={handlePayNow}
                onDismiss={() => { setConfirmedBooking(null); setBookingStatus(""); }}
                paymentLoading={paymentLoading}
              />
            ) : (
              <div className="booking-steps">

                {/* Step 1 — Service */}
                <div className="booking-step reveal">
                  <div className="step-num" aria-hidden="true">1</div>
                  <div className="step-body">
                    <p className="step-label">Choose a service</p>
                    <div className="chip-row" role="group" aria-label="Select a service">
                      {services.map((service) => (
                        <button
                          key={service.name}
                          className={`chip${selectedService.name === service.name ? " active" : ""}`}
                          onClick={() => { setSelectedService(service); setSelectedSlot(null); }}
                          aria-pressed={selectedService.name === service.name}
                        >
                          {service.name} — ${service.price}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step 2 — Date & Slot */}
                <div className="booking-step reveal">
                  <div className="step-num" aria-hidden="true">2</div>
                  <div className="step-body">
                    <p className="step-label">Pick a date &amp; slot</p>
                    <div className="field">
                      <label htmlFor="booking-date">Date</label>
                      <input
                        id="booking-date"
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                    </div>

                    {/* Slot grid */}
                    <div className="slot-grid" role="group" aria-label="Available time slots">
                      {!selectedDate && (
                        <p className="muted" style={{ fontSize: "0.875rem" }}>
                          To check availability, choose a date.
                        </p>
                      )}
                      {selectedDate && loadingSlots && (
                        <p className="muted" style={{ fontSize: "0.875rem" }}>Loading slots…</p>
                      )}
                      {selectedDate && !loadingSlots && slotsError && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                          <p className="status-err">
                            Couldn&apos;t connect to the server. Check your connection and try again.
                          </p>
                          <button
                            className="btn-ghost"
                            style={{ width: "fit-content", padding: "0.5rem 1.25rem", fontSize: "0.8rem" }}
                            onClick={() => fetchAvailability(selectedDate)}
                          >
                            Retry
                          </button>
                        </div>
                      )}
                      {selectedDate && !loadingSlots && !slotsError && availability.length === 0 && (
                        <p className="muted" style={{ fontSize: "0.875rem" }}>
                          No slots available for this date. Try another.
                        </p>
                      )}
                      {selectedDate && !slotsError && availability.map((slot) => (
                        <button
                          key={slot.id}
                          className={`slot${selectedSlot?.id === slot.id ? " active" : ""}`}
                          onClick={() => setSelectedSlot(slot)}
                          aria-pressed={selectedSlot?.id === slot.id}
                        >
                          {formatSlot(slot)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step 3 — Customer info */}
                <div className="booking-step reveal">
                  <div className="step-num" aria-hidden="true">3</div>
                  <div className="step-body">
                    <p className="step-label">Your info</p>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="customer-name">Full name</label>
                        <input
                          id="customer-name"
                          type="text"
                          placeholder="Your name"
                          value={customerForm.name}
                          onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))}
                          autoComplete="name"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="customer-email">Email</label>
                        <input
                          id="customer-email"
                          type="email"
                          placeholder="you@example.com"
                          value={customerForm.email}
                          onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))}
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    <div className="field" style={{ marginTop: "0.75rem" }}>
                      <label htmlFor="customer-phone">
                        Phone <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>(optional)</span>
                      </label>
                      <input
                        id="customer-phone"
                        type="tel"
                        placeholder="(502) 000-0000"
                        value={customerForm.phone}
                        onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))}
                        autoComplete="tel"
                      />
                    </div>

                    {selectedService.name === "Mobile" && (
                      <div className="field" style={{ marginTop: "0.75rem" }}>
                        <label htmlFor="mobile-address">Service address</label>
                        <input
                          id="mobile-address"
                          type="text"
                          placeholder="Where should Russ meet you?"
                          value={mobileAddress}
                          onChange={(e) => setMobileAddress(e.target.value)}
                          autoComplete="street-address"
                        />
                      </div>
                    )}

                    <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <button
                        className="btn-primary"
                        onClick={handleBooking}
                        disabled={bookingLoading}
                      >
                        {bookingLoading ? "Booking…" : "Confirm Booking"}
                      </button>

                      {bookingStatus && (
                        <p className={statusClass(bookingStatus)} role="status">
                          {statusText(bookingStatus)}
                        </p>
                      )}

                      {user?.role === "OWNER" && (
                        <a className="owner-link" href="/owner">Owner Schedule →</a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Auth sidebar */}
          <aside className="auth-sidebar" aria-label="Account">
            <h3>Your Account</h3>
            {user ? (
              <div className="user-pill">
                <p style={{ fontWeight: 700, margin: "0 0 2px", fontSize: "0.9rem" }}>{user.name}</p>
                <p style={{ fontSize: "0.78rem", color: "var(--fg-muted)", margin: 0 }}>{user.email}</p>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
                Log in to manage your bookings and leave a review after your cut.
              </p>
            )}
            <div className="pay-badge">
              <span className="pay-badge-label">Secure payments by</span>
              <span className="pay-badge-brand">Stripe</span>
            </div>
          </aside>
        </div>
      </section>

      {/* ══ BARBER ══ */}
      <section className="section barber-section" id="barber" aria-labelledby="barber-title">
        <div className="barber-layout">
          <div className="barber-photo-wrap reveal-left">
            <div className="barber-photo-placeholder" aria-hidden="true">
              <p>Photo coming soon</p>
            </div>
          </div>
          <div className="barber-info reveal">
            <span className="section-label">The Barber</span>
            <h2 className="barber-name" id="barber-title">Russ<span className="accent">.</span></h2>
            <div className="barber-specialty" aria-label="Specialties">
              <span className="barber-tag">Signature Fades</span>
              <span className="barber-tag">Detail Work</span>
              <span className="barber-tag">Grooming</span>
              <span className="barber-tag">Mobile Cuts</span>
            </div>
            <p className="barber-bio">
              Russ has been perfecting fades in the &apos;ville for years. Every client gets his full
              attention — no shortcuts, no assembly line. From a quick lineup to a full cut and beard
              detail, he brings the same focus to every session. Mobile bookings available within 10 miles.
            </p>
            <button className="btn-primary" onClick={() => scrollTo("#book")}>Book with Russ</button>
          </div>
        </div>
      </section>

      {/* ══ GALLERY ══ */}
      <section className="gallery" id="gallery" aria-labelledby="gallery-title">
        <div className="gallery-header reveal">
          <span className="section-label">The Work</span>
          <h2 className="section-title" id="gallery-title">Gallery</h2>
        </div>
        <div className="gallery-grid stagger" role="list">
          {galleryImages.map((img, index) => (
            <div
              key={img}
              className={`gallery-tile tile-${(index % 6) + 1}`}
              style={{ backgroundImage: `url(${img})` }}
              onClick={() => openLightbox(img, index)}
              role="listitem button"
              tabIndex={0}
              aria-label={`View cut ${index + 1} full size`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openLightbox(img, index)}
            />
          ))}
        </div>
      </section>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="lightbox"
          onClick={(e) => e.target === e.currentTarget && closeLightbox()}
          role="dialog"
          aria-modal="true"
          aria-label={`Gallery image ${lightboxIndex !== null ? lightboxIndex + 1 : ""}`}
        >
          <button ref={closeBtnRef} className="lightbox-close" onClick={closeLightbox} aria-label="Close image">✕</button>
          <img
            src={lightboxImage}
            alt={`Haircut example ${lightboxIndex !== null ? lightboxIndex + 1 : ""}`}
            className="lightbox-img"
            loading="lazy"
          />
        </div>
      )}

      {/* ══ REVIEWS ══ */}
      <section className="section reviews" id="reviews" aria-labelledby="reviews-title">
        <div className="section-header reveal">
          <span className="section-label">Client Reviews</span>
          <h2 className="section-title" id="reviews-title">Living Proof</h2>
          <p className="section-desc">What clients say after sitting in the chair.</p>
        </div>

        {reviews.length > 0 && (
          <div className="review-grid stagger">
            {reviews.map((review) => (
              <div key={review.id} className="review-card">
                <StarRating rating={review.rating} />
                <p className="review-name">{review.name}</p>
                <p className="review-comment">{review.comment}</p>
              </div>
            ))}
          </div>
        )}

        {reviews.length === 0 && (
          <p className="muted" style={{ marginBottom: "2.5rem", fontSize: "0.9rem" }}>
            No reviews yet — be the first after your cut.
          </p>
        )}

        <div className="review-submit reveal" role="form" aria-label="Submit a review">
          <div>
            <label className="review-submit-label" htmlFor="review-rating">Rating</label>
            <select
              id="review-rating"
              value={reviewForm.rating}
              onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
              style={{
                height: "2.75rem", width: "100%",
                background: "var(--bg-card)", border: "1px solid var(--border-mid)",
                borderRadius: "var(--radius)", padding: "0 0.875rem",
                color: "var(--fg)", fontFamily: "var(--font-body)", fontSize: "0.875rem", outline: "none",
              }}
            >
              {[5, 4, 3, 2, 1].map((v) => <option key={v} value={v}>{v} Stars</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="review-comment">Your review</label>
            <input
              id="review-comment"
              type="text"
              placeholder="Share your experience"
              value={reviewForm.comment}
              onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn-primary" onClick={handleReviewSubmit}>Submit</button>
          </div>
        </div>

        {reviewStatus && (
          <p className={statusClass(reviewStatus)} role="status" style={{ marginTop: "0.75rem" }}>
            {statusText(reviewStatus)}
          </p>
        )}
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="footer">
        <div className="footer-brand">
          <h3>d4gcutz</h3>
          <p>All rights reserved &middot; vycesolutions 2026</p>
        </div>
        <nav className="footer-nav" aria-label="Footer navigation">
          {[["#services","Services"],["#book","Book"],["#gallery","Gallery"],["#reviews","Reviews"]].map(
            ([href, label]) => (
              <a key={href} href={href} onClick={(e) => { e.preventDefault(); scrollTo(href); }}>{label}</a>
            )
          )}
        </nav>
      </footer>
    </div>
  );
}
