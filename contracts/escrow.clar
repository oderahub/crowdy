;; STX Escrow - Trustless P2P Trading
;; Clarity 4 (Epoch 3.3) - Uses new Clarity 4 features
;; 
;; New Clarity 4 Features Used:
;; - stacks-block-time: Real timestamps for timelocks
;; - as-contract? (Clarity 4): Secure asset handling with allowances
;;
;; Designed for Stacks Builder Challenge Week 3

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-OWNER (err u100))
(define-constant ERR-ESCROW-NOT-FOUND (err u101))
(define-constant ERR-UNAUTHORIZED (err u102))
(define-constant ERR-ALREADY-RELEASED (err u103))
(define-constant ERR-ALREADY-DISPUTED (err u104))
(define-constant ERR-NOT-DISPUTED (err u105))
(define-constant ERR-INSUFFICIENT-FUNDS (err u106))
(define-constant ERR-INVALID-AMOUNT (err u107))
(define-constant ERR-TIMELOCK-ACTIVE (err u108))
(define-constant ERR-SELF-ESCROW (err u109))
(define-constant ERR-TRANSFER-FAILED (err u110))

;; Platform fee: 0.5%
(define-constant PLATFORM-FEE u5)
(define-constant FEE-DENOMINATOR u1000)

;; ============================================
;; DATA VARIABLES
;; ============================================

(define-data-var escrow-count uint u0)
(define-data-var total-volume uint u0)
(define-data-var total-escrows-completed uint u0)
(define-data-var treasury principal CONTRACT-OWNER)

;; ============================================
;; DATA MAPS
;; ============================================

;; Escrow storage - Clarity 4 timestamps for timelocks
(define-map escrows uint {
  depositor: principal,
  beneficiary: principal,
  arbiter: (optional principal),
  amount: uint,
  released-amount: uint,
  description: (string-ascii 200),
  created-time: uint,          ;; Clarity 4: Real timestamp
  timelock-until: uint,        ;; Clarity 4: Real timestamp for unlock
  status: (string-ascii 20),
  created-at: uint,
  completed-at: (optional uint)
})

;; Dispute storage
(define-map disputes uint {
  reason: (string-ascii 500),
  disputed-by: principal,
  disputed-at: uint,           ;; Clarity 4: Real timestamp
  resolution: (optional (string-ascii 200)),
  resolved-at: (optional uint)
})

;; User stats
(define-map user-stats principal {
  escrows-created: uint,
  escrows-received: uint,
  escrows-completed: uint,
  disputes-involved: uint,
  total-deposited: uint,
  total-received: uint,
  last-activity: uint
})

;; ============================================
;; PRIVATE FUNCTIONS
;; ============================================

(define-private (update-depositor-stats (user principal) (amount uint))
  (let
    (
      (current-stats (default-to 
        { escrows-created: u0, escrows-received: u0, escrows-completed: u0, disputes-involved: u0, total-deposited: u0, total-received: u0, last-activity: u0 }
        (map-get? user-stats user)))
    )
    (map-set user-stats user {
      escrows-created: (+ (get escrows-created current-stats) u1),
      escrows-received: (get escrows-received current-stats),
      escrows-completed: (get escrows-completed current-stats),
      disputes-involved: (get disputes-involved current-stats),
      total-deposited: (+ (get total-deposited current-stats) amount),
      total-received: (get total-received current-stats),
      last-activity: stacks-block-time
    })
  )
)

(define-private (update-beneficiary-stats (user principal) (amount uint))
  (let
    (
      (current-stats (default-to 
        { escrows-created: u0, escrows-received: u0, escrows-completed: u0, disputes-involved: u0, total-deposited: u0, total-received: u0, last-activity: u0 }
        (map-get? user-stats user)))
    )
    (map-set user-stats user {
      escrows-created: (get escrows-created current-stats),
      escrows-received: (+ (get escrows-received current-stats) u1),
      escrows-completed: (+ (get escrows-completed current-stats) u1),
      disputes-involved: (get disputes-involved current-stats),
      total-deposited: (get total-deposited current-stats),
      total-received: (+ (get total-received current-stats) amount),
      last-activity: stacks-block-time
    })
  )
)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Create a new escrow with real-time timelock (Clarity 4)
(define-public (create-escrow 
    (beneficiary principal)
    (amount uint)
    (description (string-ascii 200))
    (timelock-seconds uint)
    (arbiter (optional principal)))
  (let
    (
      (escrow-id (+ (var-get escrow-count) u1))
      ;; Clarity 4: Use real timestamps
      (current-time stacks-block-time)
      (unlock-time (+ current-time timelock-seconds))
    )
    ;; Validations
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (not (is-eq tx-sender beneficiary)) ERR-SELF-ESCROW)
    
    ;; Transfer STX to contract custody (Clarity 4 as-contract? with allowances)
    ;; Get contract principal safely, then transfer TO it
    (let ((contract-principal (unwrap-panic (as-contract? () tx-sender))))
      (try! (stx-transfer? amount tx-sender contract-principal))
    )
    
    ;; Store escrow with Clarity 4 timestamps
    (map-set escrows escrow-id {
      depositor: tx-sender,
      beneficiary: beneficiary,
      arbiter: arbiter,
      amount: amount,
      released-amount: u0,
      description: description,
      created-time: current-time,
      timelock-until: unlock-time,
      status: "active",
      created-at: stacks-block-height,
      completed-at: none
    })
    
    ;; Update counter
    (var-set escrow-count escrow-id)
    (var-set total-volume (+ (var-get total-volume) amount))
    
    ;; Update user stats
    (update-depositor-stats tx-sender amount)
    
    ;; Clarity 4: Better logging with to-ascii
    (print { 
      event: "escrow-created", 
      escrow-id: escrow-id, 
      depositor: tx-sender,
      beneficiary: beneficiary,
      amount: amount,
      unlock-time: unlock-time,
    })
    
    (ok escrow-id)
  )
)

;; Release funds to beneficiary (depositor only)
(define-public (release-escrow (escrow-id uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
      (amount (get amount escrow))
      (released (get released-amount escrow))
      (remaining (- amount released))
      (fee-amount (/ (* remaining PLATFORM-FEE) FEE-DENOMINATOR))
      (release-amount (- remaining fee-amount))
      (current-time stacks-block-time)
    )
    ;; Only depositor can release
    (asserts! (is-eq tx-sender (get depositor escrow)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status escrow) "active") ERR-ALREADY-RELEASED)
    (asserts! (> remaining u0) ERR-INSUFFICIENT-FUNDS)
    
    ;; Transfer to beneficiary and fee (Clarity 4: with-stx allowance)
    (unwrap! (as-contract? ((with-stx (get amount escrow)))
      (try! (stx-transfer? release-amount tx-sender (get beneficiary escrow)))
      (try! (stx-transfer? fee-amount tx-sender (var-get treasury)))
      true
    ) ERR-TRANSFER-FAILED)
    
    ;; Update escrow
    (map-set escrows escrow-id 
      (merge escrow { 
        released-amount: amount,
        status: "released",
        completed-at: (some current-time)
      })
    )
    
    ;; Update stats
    (var-set total-escrows-completed (+ (var-get total-escrows-completed) u1))
    (update-beneficiary-stats (get beneficiary escrow) release-amount)
    
    (print { 
      event: "escrow-released", 
      escrow-id: escrow-id, 
      beneficiary: (get beneficiary escrow),
      amount: release-amount,
      released-at: current-time
    })
    
    (ok true)
  )
)

;; Partial release
(define-public (partial-release (escrow-id uint) (release-amount uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
      (amount (get amount escrow))
      (released (get released-amount escrow))
      (remaining (- amount released))
      (fee-amount (/ (* release-amount PLATFORM-FEE) FEE-DENOMINATOR))
      (net-release (- release-amount fee-amount))
      (current-time stacks-block-time)
    )
    ;; Only depositor can release
    (asserts! (is-eq tx-sender (get depositor escrow)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status escrow) "active") ERR-ALREADY-RELEASED)
    (asserts! (<= release-amount remaining) ERR-INSUFFICIENT-FUNDS)
    (asserts! (> release-amount u0) ERR-INVALID-AMOUNT)
    
    ;; Transfer to beneficiary and fee (Clarity 4: with-stx allowance)
    (unwrap! (as-contract? ((with-stx release-amount))
      (try! (stx-transfer? net-release tx-sender (get beneficiary escrow)))
      (try! (stx-transfer? fee-amount tx-sender (var-get treasury)))
      true
    ) ERR-TRANSFER-FAILED)
    
    ;; Update escrow
    (map-set escrows escrow-id 
      (merge escrow { 
        released-amount: (+ released release-amount)
      })
    )
    
    ;; Update beneficiary stats
    (update-beneficiary-stats (get beneficiary escrow) net-release)
    
    (print { 
      event: "partial-release", 
      escrow-id: escrow-id, 
      amount: net-release,
      remaining: (- remaining release-amount),
      timestamp: current-time
    })
    
    (ok true)
  )
)

;; Refund to depositor (Clarity 4: time-based check)
(define-public (refund-escrow (escrow-id uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
      (amount (get amount escrow))
      (released (get released-amount escrow))
      (remaining (- amount released))
      ;; Clarity 4: Use real timestamp for timelock check
      (current-time stacks-block-time)
    )
    ;; Only depositor can refund
    (asserts! (is-eq tx-sender (get depositor escrow)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status escrow) "active") ERR-ALREADY-RELEASED)
    ;; Clarity 4: Time-based timelock check
    (asserts! (> current-time (get timelock-until escrow)) ERR-TIMELOCK-ACTIVE)
    (asserts! (> remaining u0) ERR-INSUFFICIENT-FUNDS)
    
    ;; Transfer back to depositor (Clarity 4: with-stx allowance)
    (unwrap! (as-contract? ((with-stx remaining))
      (try! (stx-transfer? remaining tx-sender (get depositor escrow)))
      true
    ) ERR-TRANSFER-FAILED)
    
    ;; Update escrow
    (map-set escrows escrow-id 
      (merge escrow { 
        status: "refunded",
        completed-at: (some current-time)
      })
    )
    
    (print { 
      event: "escrow-refunded", 
      escrow-id: escrow-id, 
      depositor: (get depositor escrow),
      amount: remaining,
      refunded-at: current-time
    })
    
    (ok true)
  )
)

;; Raise a dispute
(define-public (raise-dispute (escrow-id uint) (reason (string-ascii 500)))
  (let
    (
      (escrow (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
      (current-time stacks-block-time)
    )
    ;; Either depositor or beneficiary can dispute
    (asserts! 
      (or 
        (is-eq tx-sender (get depositor escrow))
        (is-eq tx-sender (get beneficiary escrow))
      )
      ERR-UNAUTHORIZED
    )
    (asserts! (is-eq (get status escrow) "active") ERR-ALREADY-RELEASED)
    (asserts! (is-none (map-get? disputes escrow-id)) ERR-ALREADY-DISPUTED)
    
    ;; Create dispute with Clarity 4 timestamp
    (map-set disputes escrow-id {
      reason: reason,
      disputed-by: tx-sender,
      disputed-at: current-time,
      resolution: none,
      resolved-at: none
    })
    
    ;; Update escrow status
    (map-set escrows escrow-id 
      (merge escrow { status: "disputed" })
    )
    
    ;; Update user stats
    (let
      (
        (current-stats (default-to 
          { escrows-created: u0, escrows-received: u0, escrows-completed: u0, disputes-involved: u0, total-deposited: u0, total-received: u0, last-activity: u0 }
          (map-get? user-stats tx-sender)))
      )
      (map-set user-stats tx-sender 
        (merge current-stats { 
          disputes-involved: (+ (get disputes-involved current-stats) u1),
          last-activity: current-time
        })
      )
    )
    
    (print { 
      event: "dispute-raised", 
      escrow-id: escrow-id, 
      disputed-by: tx-sender,
      reason: reason,
      timestamp: current-time
    })
    
    (ok true)
  )
)

;; Resolve dispute (arbiter only)
(define-public (resolve-dispute 
    (escrow-id uint) 
    (resolution (string-ascii 200))
    (release-to-beneficiary bool))
  (let
    (
      (escrow (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
      (dispute (unwrap! (map-get? disputes escrow-id) ERR-NOT-DISPUTED))
      (amount (- (get amount escrow) (get released-amount escrow)))
      (fee-amount (/ (* amount PLATFORM-FEE) FEE-DENOMINATOR))
      (net-amount (- amount fee-amount))
      (current-time stacks-block-time)
    )
    ;; Only arbiter can resolve
    (asserts! (is-some (get arbiter escrow)) ERR-UNAUTHORIZED)
    (asserts! (is-eq tx-sender (unwrap-panic (get arbiter escrow))) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status escrow) "disputed") ERR-NOT-DISPUTED)
    
    ;; Transfer based on resolution and fee (Clarity 4: with-stx allowance)
    (unwrap! (as-contract? ((with-stx (get amount escrow)))
      (try! (if release-to-beneficiary
        (stx-transfer? net-amount tx-sender (get beneficiary escrow))
        (stx-transfer? net-amount tx-sender (get depositor escrow))
      ))
      (try! (stx-transfer? fee-amount tx-sender (var-get treasury)))
      true
    ) ERR-TRANSFER-FAILED)
    
    ;; Update dispute
    (map-set disputes escrow-id 
      (merge dispute { 
        resolution: (some resolution),
        resolved-at: (some current-time)
      })
    )
    
    ;; Update escrow
    (map-set escrows escrow-id 
      (merge escrow { 
        status: "resolved",
        completed-at: (some current-time)
      })
    )
    
    (print { 
      event: "dispute-resolved", 
      escrow-id: escrow-id, 
      resolution: resolution,
      released-to: (if release-to-beneficiary (get beneficiary escrow) (get depositor escrow)),
      resolved-at: current-time
    })
    
    (ok true)
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-escrow (escrow-id uint))
  (map-get? escrows escrow-id)
)

(define-read-only (get-dispute (escrow-id uint))
  (map-get? disputes escrow-id)
)

(define-read-only (get-escrow-count)
  (var-get escrow-count)
)

(define-read-only (get-user-stats (user principal))
  (default-to 
    { escrows-created: u0, escrows-received: u0, escrows-completed: u0, disputes-involved: u0, total-deposited: u0, total-received: u0, last-activity: u0 }
    (map-get? user-stats user))
)

(define-read-only (get-total-stats)
  {
    total-escrows: (var-get escrow-count),
    total-volume: (var-get total-volume),
    total-completed: (var-get total-escrows-completed)
  }
)

(define-read-only (is-escrow-active (escrow-id uint))
  (let
    (
      (escrow (map-get? escrows escrow-id))
    )
    (if (is-none escrow)
      false
      (is-eq (get status (unwrap-panic escrow)) "active")
    )
  )
)

;; Clarity 4: Time-based refund eligibility
(define-read-only (can-refund (escrow-id uint))
  (let
    (
      (escrow (map-get? escrows escrow-id))
      (current-time stacks-block-time)
    )
    (if (is-none escrow)
      false
      (let
        (
          (e (unwrap-panic escrow))
        )
        (and
          (is-eq (get status e) "active")
          (> current-time (get timelock-until e))
        )
      )
    )
  )
)

;; Get time until unlock (Clarity 4)
(define-read-only (get-time-until-unlock (escrow-id uint))
  (let
    (
      (escrow (map-get? escrows escrow-id))
      (current-time stacks-block-time)
    )
    (if (is-none escrow)
      u0
      (let
        (
          (e (unwrap-panic escrow))
          (unlock-time (get timelock-until e))
        )
        (if (> unlock-time current-time)
          (- unlock-time current-time)
          u0
        )
      )
    )
  )
)

(define-read-only (get-remaining-amount (escrow-id uint))
  (let
    (
      (escrow (map-get? escrows escrow-id))
    )
    (if (is-none escrow)
      u0
      (let
        (
          (e (unwrap-panic escrow))
        )
        (- (get amount e) (get released-amount e))
      )
    )
  )
)

;; Get current time (Clarity 4)
(define-read-only (get-current-time)
  stacks-block-time
)
