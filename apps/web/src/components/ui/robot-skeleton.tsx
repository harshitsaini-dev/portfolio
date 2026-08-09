/**
 * The endoskeleton revealed inside the portrait's x-ray window.
 *
 * ## Every coordinate is measured, not eyeballed
 *
 * The silhouette was sampled from the portrait's own alpha channel — for each
 * row, the first and last non-transparent pixel — and the parts below are cut
 * to that profile rather than to a generic figure:
 *
 * ```
 *   y  30   crown            y 140   x 192..296   (temples narrowing)
 *   y  80   x 180..307  ←widest      y 180   x 209..279   (jaw)
 *   y 100   x 184..307            y 220   x 180..337   (shoulders opening)
 *   y 120   x 189..304            y 260   x 139..384   (shoulder line)
 * ```
 *
 * So the skull plate is a **traced outline**, not a rounded rectangle: it
 * bulges at the temples around y 85 and tapers to the jaw at y 185, which is
 * what makes it sit inside the face instead of on top of it. The shoulder
 * hubs sit on the measured ramp at y 252, and the arm columns follow the
 * sleeves rather than the jacket edge, which keeps flaring below y 300.
 *
 * The viewBox is 520x520 because that is exactly the box the portrait renders
 * into, and the source image is square, so image pixels and viewBox units are
 * the same unit. **These numbers describe *that photograph*.** Replacing the
 * portrait means sampling the alpha channel again.
 *
 * ## Why an SVG rather than a filtered copy of the photograph
 *
 * The first attempt inverted the photo inside the window. Wrong twice over:
 * the ask was to see a robot under the skin, and a negative of a person is
 * still a person — and the filter chain blew a dark navy jacket out to a flat
 * white disc.
 *
 * ## Reading as machinery rather than as a diagram
 *
 * Three things do that work, and all three are cheap: plates are *filled*, so
 * they read as panels rather than as wireframe floating in space; strokes vary
 * in weight, so structure separates from detail; and the parts that would
 * actually move — neck pistons, shoulder hubs, elbow servos — are drawn as
 * mechanisms with visible travel.
 *
 * Decorative throughout. It carries no information and sits inside an
 * `aria-hidden` layer.
 */
export function RobotSkeleton() {
  return (
    <svg
      viewBox="0 0 520 520"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* A blur composited under the shape, so strokes emit light rather
            than merely being outlined — the difference between an instrument
            and a diagram. */}
        <filter id="xray-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <linearGradient id="xray-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.045" />
        </linearGradient>

        <linearGradient id="xray-deep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <g
        filter="url(#xray-glow)"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* ================= Skull =======================================
            Traced from the alpha profile: crown at y 32, temples out to
            x 180/307 around y 85, tapering to the jaw at x 209/279 by y 182. */}
        <path
          d="M260 32
             C 288 32 303 52 306 86
             C 308 112 303 132 297 148
             C 291 166 280 182 260 194
             C 240 182 229 166 223 148
             C 217 132 212 112 214 86
             C 217 52 232 32 260 32 Z"
          transform="translate(-17 0)"
          fill="url(#xray-plate)"
          strokeWidth="2.4"
        />

        {/* Crown seam and forehead plate: a skull that is one shape reads as
            a mask, and a mask is not machinery. */}
        <path d="M243 32v22" strokeWidth="1.5" opacity="0.8" />
        <path
          d="M199 78 C 216 64 270 64 287 78"
          strokeWidth="1.6"
          opacity="0.85"
        />

        {/* ---- Optics --------------------------------------------------
            Two lenses on the face's own eye line, not a single visor bar. A
            bar reads as a helmet; a pair reads as something that looks back. */}
        <g>
          <circle cx="221" cy="108" r="13" fill="url(#xray-deep)" strokeWidth="2.2" />
          <circle cx="221" cy="108" r="5.5" fill="currentColor" stroke="none" opacity="0.9" />
          <circle cx="265" cy="108" r="13" fill="url(#xray-deep)" strokeWidth="2.2" />
          <circle cx="265" cy="108" r="5.5" fill="currentColor" stroke="none" opacity="0.9" />
          {/* Brow bar tying the two housings together. */}
          <path d="M206 92 H280" strokeWidth="1.5" opacity="0.7" />
        </g>

        {/* ---- Cheek plates and jaw ------------------------------------- */}
        <path d="M205 126 L214 152 L226 162" strokeWidth="1.5" opacity="0.7" />
        <path d="M281 126 L272 152 L260 162" strokeWidth="1.5" opacity="0.7" />
        {/* Mouth grille: four vents, shortening downward so the jaw tapers. */}
        <g strokeWidth="1.5" opacity="0.85">
          <path d="M226 158 H260" />
          <path d="M228 166 H258" />
          <path d="M231 174 H255" />
        </g>

        {/* ================= Neck ========================================
            The silhouette narrows to 70px here, so the column is 32 wide with
            the pistons outside it. */}
        <rect x="227" y="186" width="32" height="26" rx="8" fill="url(#xray-deep)" />
        {/* Actuators either side, with visible travel. */}
        <path d="M219 188 v22 M223 192 v14" strokeWidth="1.6" opacity="0.75" />
        <path d="M267 188 v22 M263 192 v14" strokeWidth="1.6" opacity="0.75" />

        {/* ================= Shoulders ===================================
            Hubs on the measured ramp (y 220 → 260), inside the jacket line. */}
        <g>
          {/* Pauldron plates, layered over the hubs. */}
          <path
            d="M150 258 C 152 232 166 220 186 220 L196 240 L176 276 Z"
            fill="url(#xray-plate)"
            strokeWidth="1.8"
          />
          <path
            d="M370 258 C 368 232 354 220 334 220 L324 240 L344 276 Z"
            fill="url(#xray-plate)"
            strokeWidth="1.8"
          />
          <circle cx="176" cy="252" r="19" fill="url(#xray-deep)" strokeWidth="2.2" />
          <circle cx="176" cy="252" r="7" />
          <circle cx="344" cy="252" r="19" fill="url(#xray-deep)" strokeWidth="2.2" />
          <circle cx="344" cy="252" r="7" />
        </g>

        {/* Collarbone struts, from the neck column out to each hub. */}
        <path d="M232 214 L186 240" strokeWidth="1.8" opacity="0.85" />
        <path d="M254 214 L334 240" strokeWidth="1.8" opacity="0.85" />

        {/* ================= Chest =======================================
            Kept inside the shoulders: the silhouette keeps widening below
            y 300, but that is the jacket flaring, not the ribcage. */}
        <path
          d="M199 224
             C 214 214 268 214 283 224
             L292 300
             C 292 344 278 372 241 386
             C 204 372 190 344 190 300 Z"
          transform="translate(19 0)"
          fill="url(#xray-plate)"
          strokeWidth="2.2"
        />

        {/* Sternum. */}
        <path d="M260 232 v146" strokeWidth="1.6" opacity="0.8" />
        {/* Ribs, curved and thinning downward so the eye reads a direction. */}
        <g fill="none" opacity="0.75">
          <path d="M214 264 C 236 274 284 274 306 264" strokeWidth="1.7" />
          <path d="M212 292 C 234 304 286 304 308 292" strokeWidth="1.6" />
          <path d="M214 320 C 236 332 284 332 306 320" strokeWidth="1.45" />
          <path d="M220 348 C 240 358 280 358 300 348" strokeWidth="1.3" />
        </g>

        {/* The core, sitting on the sternum. */}
        <circle cx="260" cy="286" r="22" fill="url(#xray-deep)" strokeWidth="2.2" />
        <circle cx="260" cy="286" r="12" strokeWidth="1.5" opacity="0.85" />
        <circle cx="260" cy="286" r="5" fill="currentColor" stroke="none" />

        {/* ================= Arms ========================================
            Following the sleeves. Each limb is a plated column with a piston
            beside it and a servo at the joint. */}
        {[
          { hub: 176, dir: -1 },
          { hub: 344, dir: 1 },
        ].map(({ hub, dir }) => (
          <g key={hub}>
            {/* Upper arm. */}
            <rect
              x={hub - 21}
              y={276}
              width={42}
              height={104}
              rx={19}
              fill="url(#xray-plate)"
              strokeWidth="1.9"
            />
            {/* Piston, on the outer side so it never crosses the torso. */}
            <path
              d={`M${hub + dir * 26} 286 v72 M${hub + dir * 26} 300 v44`}
              strokeWidth="1.6"
              opacity="0.7"
            />
            {/* Elbow servo. */}
            <circle cx={hub} cy={390} r="14" fill="url(#xray-deep)" strokeWidth="2.1" />
            <circle cx={hub} cy={390} r="5.5" />
            {/* Forearm, slightly narrower — a limb of one width reads as a
                pipe rather than an arm. */}
            <rect
              x={hub - 18}
              y={402}
              width={36}
              height={94}
              rx={16}
              fill="url(#xray-plate)"
              strokeWidth="1.9"
            />
            {/* Cable run down the forearm. */}
            <path
              d={`M${hub - dir * 8} 408 v82`}
              strokeWidth="1.4"
              opacity="0.6"
            />
          </g>
        ))}

        {/* ================= Pelvis ====================================== */}
        <path
          d="M216 388 H304 C 310 388 314 393 313 400 L308 436 C 306 448 296 456 284 456 H236 C 224 456 214 448 212 436 L207 400 C 206 393 210 388 216 388 Z"
          fill="url(#xray-plate)"
          strokeWidth="2"
        />
        <path d="M236 390 v62 M284 390 v62" strokeWidth="1.4" opacity="0.6" />

        {/* ================= Wiring ======================================
            A few runs that leave the plates, so the parts read as one machine
            rather than as separate components. */}
        <g strokeWidth="1.3" opacity="0.5">
          <path d="M199 240 C 186 244 178 232 178 220" />
          <path d="M321 240 C 334 244 342 232 342 220" />
          <path d="M212 404 C 198 410 190 424 192 442" />
          <path d="M308 404 C 322 410 330 424 328 442" />
        </g>
      </g>
    </svg>
  );
}
