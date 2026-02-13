import { useEffect, useMemo, useState, useCallback } from "react";
import "./App.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const services = [
  { name: "Full Cut", price: 30 },
  { name: "Lineup", price: 15 },
  { name: "Mobile", price: 50 },
];

const heroImages = ["/background.jpg"];

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

const barberProfile = {
  name: "Barber Name",
  specialty: "Signature fades \u00b7 Detail work \u00b7 Grooming",
  image: "",
};

const formatTimeEST = (time24) => {
  const [h = "0", m = "0"] = String(time24 || "00:00").split(":");
  const hour = Number(h);
  const minute = Number(m);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix} EST`;
};

const formatSlot = (slot) =>
  `${slot.date} \u00b7 ${formatTimeEST(slot.start_time)}\u2013${formatTimeEST(slot.end_time)}`;

const safeFetch = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  }
};

function App() {
  const [heroIndex, setHeroIndex] = useState(0);
  const [token] = useState(localStorage.getItem("token") || "");
  const [user] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [availability, setAvailability] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedService, setSelectedService] = useState(services[0]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [bookingStatus, setBookingStatus] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "" });
  const [mobileAddress, setMobileAddress] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const heroImage = useMemo(() => heroImages[heroIndex], [heroIndex]);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const fetchAvailability = useCallback(async (dateFilter = "") => {
    setLoadingSlots(true);
    try {
      const query = dateFilter ? `?date=${encodeURIComponent(dateFilter)}` : "";
      const res = await safeFetch(`${API_BASE}/availability/open${query}`);
      if (!res.ok) throw new Error("Failed to load slots");
      const data = await res.json();
      setAvailability(data);
    } catch (err) {
      console.error("Failed to fetch availability:", err.message);
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
    } catch (err) {
      console.error("Failed to fetch reviews:", err.message);
    }
  }, []);

  useEffect(() => {
    fetchAvailability();
    fetchReviews();
  }, [fetchAvailability, fetchReviews]);

  useEffect(() => {
    if (reviews.length === 0) return;
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % reviews.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [reviews.length]);

  useEffect(() => {
    if (selectedDate) fetchAvailability(selectedDate);
  }, [selectedDate, fetchAvailability]);

  const handleBooking = async () => {
    if (!customerForm.name.trim() || !customerForm.email.trim()) {
      setBookingStatus("Please enter your name and email to book.");
      return;
    }
    if (!selectedSlot) {
      setBookingStatus("Select a slot.");
      return;
    }
    if (selectedService.name === "Mobile" && !mobileAddress.trim()) {
      setBookingStatus("Add a service address for mobile bookings.");
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
          address: selectedService.name === "Mobile" ? mobileAddress.trim() : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingStatus(data.message || "Booking failed.");
        return;
      }
      setBookingStatus("Booked! You'll receive a confirmation shortly.");
      setSelectedSlot(null);
      setCustomerForm({ name: "", email: "" });
      setMobileAddress("");
      fetchAvailability(selectedDate);
    } catch (err) {
      setBookingStatus(err.message || "Something went wrong. Please try again.");
    } finally {
      setBookingLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!token) {
      setBookingStatus("Login to leave a review.");
      return;
    }
    if (!reviewForm.comment.trim()) {
      setBookingStatus("Add a quick review note before submitting.");
      return;
    }

    try {
      const res = await safeFetch(`${API_BASE}/reviews`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(reviewForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingStatus(data.message || "Review failed.");
        return;
      }
      setReviewForm({ rating: 5, comment: "" });
      setBookingStatus("Review submitted. Thanks!");
      fetchReviews();
    } catch (err) {
      setBookingStatus(err.message || "Failed to submit review.");
    }
  };

  return (
    <div className="page">
      <header className="hero" style={{ backgroundImage: `url(${heroImage})` }}>
        <div className="hero-overlay" />
        <nav className="nav">
          <span className="logo">
            <img src="/IMG_7755.png" alt="d4gcutz logo" width="34" height="34" />
            d4gcutz
          </span>
          <div className="nav-links">
            <a href="#services">Services</a>
            <a href="#book">Book</a>
            <a href="#barber">Meet the barber</a>
            <a href="#gallery">Gallery</a>
            <a href="#reviews">Reviews</a>
            {user && <a href="#profile">Profile</a>}
          </div>
          <button className="nav-cta" onClick={() => document.querySelector("#book").scrollIntoView({ behavior: "smooth" })}>
            Book Now
          </button>
        </nav>

        <div className="hero-content">
          <Badge className="hero-badge">Best Cutz in the &apos;ville &middot; Book with Russ</Badge>
          <h1 className="hero-title">
            Refresh that
            <span className="headline-accent">Inner</span>
            <span className="headline-emphasis">DAWG</span>
          </h1>
          <p className="hero-copy">
            If you have been struggling to find a vetted barber in your area look no further! Here for
            college and bringing all the skills right on with me to bring to best haircuts and styles to
            each client. Here at d4gcutz you will always be in good hands.
          </p>
          <div className="hero-actions">
            <Button className="primary" onClick={() => document.querySelector("#book").scrollIntoView({ behavior: "smooth" })}>
              Book a Session
            </Button>
            <Button variant="ghost" className="ghost" onClick={() => document.querySelector("#barber").scrollIntoView({ behavior: "smooth" })}>
              Meet the barber
            </Button>
          </div>
          <div className="hero-qol-row">
            <span className="hero-qol-pill">Fast slot booking</span>
            <span className="hero-qol-pill">Text confirmation</span>
            <span className="hero-qol-pill">Owner managed availability</span>
          </div>
        </div>
      </header>

      <section className="section services" id="services">
        <div className="section-title">
          <h2>Precision Services</h2>
          <p></p>
        </div>
        <div className="service-grid">
          {services.map((service) => (
            <div key={service.name} className="service-card">
              <h3>{service.name}</h3>
              <p>Clean lines, tailored texture, and intentional finish.</p>
              <span>${service.price}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section booking" id="book">
        <div className="booking-panel">
          <div className="booking-header">
            <h2>Book Your Session</h2>
            <p>Pick a service and lock in an open slot.</p>
          </div>
          <div className="booking-body">
            <div className="calendar-row">
              <label htmlFor="booking-date">Select date</label>
              <input id="booking-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </div>
            <div className="booking-services">
              {services.map((service) => (
                <button key={service.name} className={selectedService.name === service.name ? "chip active" : "chip"} onClick={() => setSelectedService(service)}>
                  {service.name}
                </button>
              ))}
            </div>
            <div className="owner-slot" style={{ marginBottom: "1rem" }}>
              <Input type="text" placeholder="Your name" value={customerForm.name} onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))} />
              <Input type="email" placeholder="Your email" value={customerForm.email} onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            {selectedService.name === "Mobile" && (
              <div className="calendar-row">
                <label htmlFor="mobile-address">Service address</label>
                <input id="mobile-address" type="text" placeholder="Enter the mobile service address" value={mobileAddress} onChange={(event) => setMobileAddress(event.target.value)} />
              </div>
            )}
            <div className="slot-grid">
              {loadingSlots && <p className="muted">Loading available slots...</p>}
              {!loadingSlots && availability.length === 0 && <p className="muted">No slots available. Try selecting a different date.</p>}
              {availability.map((slot) => (
                <button key={slot.id} className={selectedSlot?.id === slot.id ? "slot active" : "slot"} onClick={() => setSelectedSlot(slot)}>
                  {formatSlot(slot)}
                </button>
              ))}
            </div>
            <Button className="primary" onClick={handleBooking} disabled={bookingLoading}>
              {bookingLoading ? "Booking..." : "Confirm Booking"}
            </Button>
            {bookingStatus && <p className="status">{bookingStatus}</p>}
            {user?.role === "OWNER" && (
              <a className="owner-link" href="/owner">
                Go to Owner Schedule
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="section stylists" id="barber">
        <div className="section-title">
          <h2>Meet the Barber</h2>
          <p>Your signature cut specialist.</p>
        </div>
        <div className="barber-card">
          <div className="stylist-photo empty">
            <span>Barber photo coming soon</span>
          </div>
          <div>
            <h3>{barberProfile.name}</h3>
            <p>{barberProfile.specialty}</p>
            <p className="muted">Details coming soon.</p>
          </div>
        </div>
      </section>

      {user && (
        <section className="section profile" id="profile">
          <div className="section-title">
            <h2>Your Profile</h2>
            <p>Quick access to your account details.</p>
          </div>
          <div className="profile-card">
            <h3>{user.name}</h3>
            <p>{user.email}</p>
            <p className="muted">Role: {user.role}</p>
          </div>
        </section>
      )}

      <section className="section gallery" id="gallery">
        <div className="gallery-grid">
          {galleryImages.map((img, index) => (
            <div
              key={`${img}-${index}`}
              className={`gallery-tile tile-${(index % 6) + 1}`}
              style={{ backgroundImage: `url(${img})` }}
              onClick={() => setLightboxImage(img)}
              role="button"
              tabIndex={0}
              aria-label={`Gallery image ${index + 1}`}
              onKeyDown={(e) => e.key === "Enter" && setLightboxImage(img)}
            />
          ))}
        </div>
      </section>

      {lightboxImage && (
        <div className="lightbox" onClick={() => setLightboxImage("")} role="dialog" aria-label="Image lightbox" onKeyDown={(e) => e.key === "Escape" && setLightboxImage("")}>
          <div className="lightbox-content">
            <img src={lightboxImage} alt="Selected cut" loading="lazy" />
          </div>
        </div>
      )}

      <section className="section reviews" id="reviews">
        <div className="section-title">
          <h2>Client Reviews</h2>
          <p>Living proof of the craft.</p>
        </div>
        <div className="review-grid">
          {reviews.map((review) => (
            <div key={review.id} className="review-card">
              <strong>{review.name}</strong>
              <span>{"\u2605".repeat(review.rating)}</span>
              <p>{review.comment}</p>
            </div>
          ))}
        </div>
        <div className="review-form">
          <select value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} Stars
              </option>
            ))}
          </select>
          <Input placeholder="Share your experience" value={reviewForm.comment} onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })} />
          <Button className="primary" onClick={handleReviewSubmit}>
            Submit Review
          </Button>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-brand">
          <h3>d4gcutz</h3>
          <p>All rights reserved &middot; vycesolutions 2026</p>
        </div>
        <div className="footer-carousel">
          <h4>What clients say</h4>
          {reviews.length === 0 ? (
            <p className="muted">No reviews yet.</p>
          ) : (
            <div className="carousel-card">
              <strong>{reviews[carouselIndex]?.name}</strong>
              <span>{"\u2605".repeat(reviews[carouselIndex]?.rating || 0)}</span>
              <p>{reviews[carouselIndex]?.comment}</p>
              <div className="carousel-controls">
                <button type="button" onClick={() => setCarouselIndex((prev) => (prev - 1 + reviews.length) % reviews.length)}>
                  Prev
                </button>
                <button type="button" onClick={() => setCarouselIndex((prev) => (prev + 1) % reviews.length)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;
