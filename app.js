// ==========================================
// Firebase Initialization & Imports (V10)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCD7Up6xaP0AmYv7PQQmlGh1nFMU_el9Zw",
  authDomain: "mj-marketing-5cfb0.firebaseapp.com",
  projectId: "mj-marketing-5cfb0",
  storageBucket: "mj-marketing-5cfb0.firebasestorage.app",
  messagingSenderId: "114095065681",
  appId: "1:114095065681:web:6bef036b9285fbe290c670",
  measurementId: "G-S1W1N47W2C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const subscriptionsRef = collection(db, "subscriptions");

// ==========================================
// State Management
// ==========================================
let isAdmin = false; // Start as normal user, check cache on lock click
let allSubscriptions = [];
let editId = null;
let itemToDelete = null;

// ==========================================
// DOM Elements
// ==========================================
const DOM = {
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    adminLockBtn: document.getElementById('adminLockBtn'),
    lockIcon: document.getElementById('lockIcon'),
    adminActions: document.getElementById('adminActions'),
    addSubscriptionBtn: document.getElementById('addSubscriptionBtn'),
    subscriptionsGrid: document.getElementById('subscriptionsGrid'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    searchInput: document.getElementById('searchInput'),
    searchInputMobile: document.getElementById('searchInputMobile'),
    
    // Modals
    adminModal: document.getElementById('adminModal'),
    adminPassword: document.getElementById('adminPassword'),
    adminSubmitBtn: document.getElementById('adminSubmitBtn'),
    adminError: document.getElementById('adminError'),
    
    subModal: document.getElementById('subModal'),
    subModalTitle: document.getElementById('subModalTitle'),
    subForm: document.getElementById('subForm'),
    subId: document.getElementById('subId'),
    subLabel: document.getElementById('subLabel'),
    subPhone: document.getElementById('subPhone'),
    subEmail: document.getElementById('subEmail'),
    subPlan: document.getElementById('subPlan'),
    subStart: document.getElementById('subStart'),
    subEnd: document.getElementById('subEnd'),
    subPayment: document.getElementById('subPayment'),
    subNotes: document.getElementById('subNotes'),
    subSaveBtn: document.getElementById('subSaveBtn'),

    deleteModal: document.getElementById('deleteModal'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

    // Payment Modal
    paymentModal: document.getElementById('paymentModal'),
    paymentForm: document.getElementById('paymentForm'),
    paymentSubId: document.getElementById('paymentSubId'),
    quickPaymentAmount: document.getElementById('quickPaymentAmount'),
    quickPaymentNotes: document.getElementById('quickPaymentNotes'),
    paymentSaveBtn: document.getElementById('paymentSaveBtn'),

    toastContainer: document.getElementById('toastContainer')
};

// ==========================================
// Initialization & Theme
// ==========================================
function init() {
    // Set initial theme (Default to Dark)
    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.classList.remove('dark');
    } else {
        document.documentElement.classList.add('dark');
    }
    
    // Auto-restore admin session if it exists in cache
    if (localStorage.getItem('agentflow_admin') === 'true') {
        isAdmin = true;
    }
    
    // Apply initial Admin state
    updateAdminUI();
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Fetch Data
    fetchSubscriptions();
}

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    if (document.documentElement.classList.contains('dark')) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
}

// ==========================================
// Admin State Logic
// ==========================================
function updateAdminUI() {
    if (isAdmin) {
        DOM.lockIcon.classList.replace('ph-lock', 'ph-lock-open');
        DOM.lockIcon.classList.add('text-emerald-500');
        DOM.adminActions.classList.remove('hidden');
        document.body.classList.add('admin-mode-active');
    } else {
        DOM.lockIcon.classList.replace('ph-lock-open', 'ph-lock');
        DOM.lockIcon.classList.remove('text-emerald-500');
        DOM.adminActions.classList.add('hidden');
        document.body.classList.remove('admin-mode-active');
    }
}

function handleAdminLogin() {
    const password = DOM.adminPassword.value;
    if (password === 'agentflow') {
        isAdmin = true;
        localStorage.setItem('agentflow_admin', 'true'); // Cache in localStorage
        updateAdminUI();
        closeModal(DOM.adminModal);
        DOM.adminPassword.value = '';
        DOM.adminError.classList.add('hidden');
        showToast('Admin access granted', 'success');
        renderCards(allSubscriptions); // Re-render to show edit/delete buttons
        
        // Request Notification Permission when logged in as Admin
        requestNotificationPermission();
    } else {
        DOM.adminError.classList.remove('hidden');
    }
}

function handleLockClick() {
    if (isAdmin) {
        // Logout
        isAdmin = false;
        localStorage.removeItem('agentflow_admin');
        updateAdminUI();
        showToast('Logged out of admin mode', 'info');
        renderCards(allSubscriptions);
    } else {
        // Check if previously logged in (cached)
        if (localStorage.getItem('agentflow_admin') === 'true') {
            isAdmin = true;
            updateAdminUI();
            showToast('Admin access restored automatically', 'success');
            renderCards(allSubscriptions);
            requestNotificationPermission();
        } else {
            openModal(DOM.adminModal);
        }
    }
}

// ==========================================
// Modal Logic
// ==========================================
function openModal(modal) {
    modal.classList.remove('hidden');
    // small delay to allow display:block to apply before opacity transition
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

function closeModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300); // match transition duration
}

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.fixed.inset-0');
        if (modal) closeModal(modal);
    });
});

// ==========================================
// Firebase CRUD Operations
// ==========================================
function fetchSubscriptions() {
    const q = query(subscriptionsRef, orderBy("endDate", "asc")); // Order by closest expiry
    
    onSnapshot(q, (snapshot) => {
        allSubscriptions = [];
        let expiredNotified = false;
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            allSubscriptions.push({ id: doc.id, ...data });
            
            // Notification Logic Check
            const { diffDays } = calculateDays(data.startDate, data.endDate);
            if (diffDays === 0 && isAdmin && !expiredNotified) {
                sendNotification(`Subscription Expired`, `${data.label}'s plan has expired today.`);
                expiredNotified = true; // prevent spamming multiple notifications at once
            }
        });
        
        DOM.loadingState.classList.add('hidden');
        renderDashboard(allSubscriptions);
        renderCards(allSubscriptions);
    }, (error) => {
        console.error("Error fetching subscriptions: ", error);
        showToast("Error loading data. Check Firebase config.", "error");
        DOM.loadingState.classList.add('hidden');
    });
}

async function handleSubFormSubmit(e) {
    e.preventDefault();
    if (!isAdmin) return;

    const data = {
        label: DOM.subLabel.value,
        phone: DOM.subPhone.value,
        email: DOM.subEmail.value,
        planName: DOM.subPlan.value,
        startDate: DOM.subStart.value,
        endDate: DOM.subEnd.value,
        payment: parseFloat(DOM.subPayment.value) || 0,
        notes: DOM.subNotes.value,
        updatedAt: serverTimestamp()
    };

    try {
        const originalText = DOM.subSaveBtn.innerHTML;
        DOM.subSaveBtn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Saving...';
        DOM.subSaveBtn.disabled = true;

        if (editId) {
            await updateDoc(doc(db, "subscriptions", editId), data);
            showToast("Subscription updated successfully", "success");
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "subscriptions"), data);
            showToast("Subscription added successfully", "success");
        }
        
        closeModal(DOM.subModal);
        DOM.subForm.reset();
    } catch (error) {
        console.error("Error saving: ", error);
        showToast("Error saving data", "error");
    } finally {
        DOM.subSaveBtn.innerHTML = 'Save Details';
        DOM.subSaveBtn.disabled = false;
    }
}

async function handleDelete() {
    if (!isAdmin || !itemToDelete) return;
    
    try {
        const originalText = DOM.confirmDeleteBtn.innerHTML;
        DOM.confirmDeleteBtn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';
        DOM.confirmDeleteBtn.disabled = true;

        await deleteDoc(doc(db, "subscriptions", itemToDelete));
        showToast("Subscription deleted", "success");
        closeModal(DOM.deleteModal);
        itemToDelete = null;
    } catch (error) {
        console.error("Error deleting: ", error);
        showToast("Error deleting data", "error");
    } finally {
        DOM.confirmDeleteBtn.innerHTML = 'Delete';
        DOM.confirmDeleteBtn.disabled = false;
    }
}

// ==========================================
// UI Rendering & Calculations
// ==========================================
function calculateDays(startDateStr, endDateStr) {
    if (!endDateStr) return { diffDays: 0, isExpired: false, percentage: 0 };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const endDate = new Date(endDateStr);
    endDate.setHours(0, 0, 0, 0);
    
    const diffTime = endDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let percentage = 0;
    if (startDateStr) {
        const startDate = new Date(startDateStr);
        startDate.setHours(0, 0, 0, 0);
        const totalTime = endDate - startDate;
        const totalDays = Math.ceil(totalTime / (1000 * 60 * 60 * 24));
        
        if (totalDays > 0) {
            const passedDays = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));
            percentage = 100 - ((passedDays / totalDays) * 100);
            if (percentage < 0) percentage = 0;
            if (percentage > 100) percentage = 100;
        }
    }
    
    return {
        diffDays,
        isExpired: diffDays <= 0,
        percentage
    };
}

function renderDashboard(dataArray) {
    let expiredCount = 0;
    let totalPayment = 0;

    dataArray.forEach(sub => {
        const { isExpired } = calculateDays(sub.startDate, sub.endDate);
        if (isExpired) expiredCount++;
        totalPayment += Number(sub.payment) || 0;
    });

    document.querySelectorAll('.statTotalCards').forEach(el => el.textContent = dataArray.length);
    document.querySelectorAll('.statExpiredCount').forEach(el => el.textContent = expiredCount);
    document.querySelectorAll('.statTotalPayment').forEach(el => el.textContent = totalPayment.toLocaleString());
}

function renderCards(dataArray) {
    DOM.subscriptionsGrid.innerHTML = '';
    
    if (dataArray.length === 0) {
        DOM.emptyState.classList.remove('hidden');
        DOM.emptyState.classList.remove('opacity-0');
    } else {
        DOM.emptyState.classList.add('hidden');
        DOM.emptyState.classList.add('opacity-0');
        
        dataArray.forEach(sub => {
            const { diffDays, isExpired, percentage } = calculateDays(sub.startDate, sub.endDate);
            const statusColor = isExpired ? 'text-red-500 bg-red-100 dark:bg-red-500/10' : 
                               diffDays <= 3 ? 'text-orange-500 bg-orange-100 dark:bg-orange-500/10' : 
                               'text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10';
            
            const daysText = isExpired ? 'Expired' : `${diffDays} Days Left`;
            const cardClass = isExpired ? 'expired expired-bg border-red-200 dark:border-red-900/50' : 'border-gray-200 dark:border-white/5';
            
            const card = document.createElement('div');
            card.className = `sub-card bg-white dark:bg-[#1a1d24] rounded-2xl p-5 border ${cardClass}`;
            
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-bold text-lg text-gray-900 dark:text-white">${sub.label || 'No Label'}</h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${sub.planName || 'Unknown Plan'}</p>
                    </div>
                    <span class="px-3 py-1 text-xs font-semibold rounded-full ${statusColor}">${daysText}</span>
                </div>
                
                <div class="space-y-3 mb-5">
                    <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <i class="ph ph-phone text-gray-400"></i>
                        ${sub.phone || 'N/A'}
                    </div>
                    <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <i class="ph ph-envelope-simple text-gray-400"></i>
                        <span class="truncate">${sub.email || 'N/A'}</span>
                    </div>
                    <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <i class="ph ph-calendar-blank text-gray-400"></i>
                        ${sub.startDate || '-'} to ${sub.endDate || '-'}
                    </div>
                </div>

                <div class="w-full mb-5 p-3 bg-yellow-50 dark:bg-yellow-500/5 border border-yellow-200 dark:border-yellow-500/20 rounded-xl">
                    <div class="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-bold mb-1">
                        <i class="ph ph-currency-circle-dollar text-lg"></i>
                        <span>Remaining Due: ${Number(sub.payment) || 0}</span>
                    </div>
                    ${sub.notes ? `<p class="text-xs text-yellow-600 dark:text-yellow-500 italic ml-6 border-l-2 border-yellow-300 dark:border-yellow-500/30 pl-2 py-0.5">${sub.notes}</p>` : `<p class="text-xs text-yellow-600/50 dark:text-yellow-500/50 italic ml-6">No payment notes added.</p>`}
                </div>

                <div class="mt-2 mb-5">
                    <div class="flex justify-between items-center mb-1.5">
                        <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Time Remaining</span>
                        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">${Math.round(percentage)}%</span>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div class="progress-bar-fill h-1.5 rounded-full transition-all duration-1000 ease-out" style="width: 0%;" data-target="${percentage}%" data-color="${isExpired ? 'bg-red-500' : diffDays <= 3 ? 'bg-orange-500' : 'bg-emerald-500'}"></div>
                    </div>
                </div>

                <div class="admin-actions flex flex-wrap gap-2 pt-4 border-t border-gray-100 dark:border-white/5">
                    <button onclick="openPaymentModal('${sub.id}')" class="w-full py-2 bg-emerald-50 dark:bg-emerald-500/5 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1 border border-emerald-200 dark:border-emerald-500/20">
                        <i class="ph ph-currency-circle-dollar"></i> Update Payment & Notes
                    </button>
                    <button onclick="editSub('${sub.id}')" class="flex-1 py-2 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1">
                        <i class="ph ph-pencil-simple"></i> Edit
                    </button>
                    <button onclick="deleteSub('${sub.id}')" class="flex-1 py-2 bg-red-50 dark:bg-red-500/5 hover:bg-red-100 dark:hover:bg-red-500/10 text-red-600 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1">
                        <i class="ph ph-trash"></i> Delete
                    </button>
                </div>
            `;
            DOM.subscriptionsGrid.appendChild(card);
        });
        
        // Trigger animations after DOM update
        setTimeout(() => {
            // Animate progress bars
            document.querySelectorAll('.progress-bar-fill').forEach(bar => {
                const target = bar.getAttribute('data-target');
                const colorClass = bar.getAttribute('data-color');
                bar.classList.add(colorClass);
                bar.style.width = target;
            });
            // Stagger card entrance (Fast)
            document.querySelectorAll('.sub-card').forEach((card, index) => {
                setTimeout(() => {
                    card.classList.add('show-card');
                }, Math.min(index * 15, 300)); // Cap the maximum stagger delay
            });
        }, 10);
    }
}

// Global functions for inline onclick handlers
window.editSub = (id) => {
    if (!isAdmin) return;
    const sub = allSubscriptions.find(s => s.id === id);
    if (!sub) return;
    
    editId = id;
    DOM.subModalTitle.textContent = 'Edit Subscription';
    DOM.subLabel.value = sub.label || '';
    DOM.subPhone.value = sub.phone || '';
    DOM.subEmail.value = sub.email || '';
    DOM.subPlan.value = sub.planName || '';
    DOM.subStart.value = sub.startDate || '';
    DOM.subEnd.value = sub.endDate || '';
    DOM.subPayment.value = sub.payment || '';
    DOM.subNotes.value = sub.notes || '';

    openModal(DOM.subModal);
};

window.deleteSub = (id) => {
    if (!isAdmin) return;
    itemToDelete = id;
    openModal(DOM.deleteModal);
};

window.openPaymentModal = (id) => {
    if (!isAdmin) return;
    const sub = allSubscriptions.find(s => s.id === id);
    if (!sub) return;
    
    DOM.paymentSubId.value = id;
    DOM.quickPaymentAmount.value = sub.payment || '';
    DOM.quickPaymentNotes.value = sub.notes || '';
    
    openModal(DOM.paymentModal);
};

async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!isAdmin) return;
    
    const id = DOM.paymentSubId.value;
    if (!id) return;

    const data = {
        payment: parseFloat(DOM.quickPaymentAmount.value) || 0,
        notes: DOM.quickPaymentNotes.value,
        updatedAt: serverTimestamp()
    };

    try {
        const originalText = DOM.paymentSaveBtn.innerHTML;
        DOM.paymentSaveBtn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Updating...';
        DOM.paymentSaveBtn.disabled = true;

        await updateDoc(doc(db, "subscriptions", id), data);
        showToast("Payment details updated", "success");
        closeModal(DOM.paymentModal);
    } catch (error) {
        console.error("Error updating payment: ", error);
        showToast("Error updating payment", "error");
    } finally {
        DOM.paymentSaveBtn.innerHTML = 'Update';
        DOM.paymentSaveBtn.disabled = false;
    }
}

// ==========================================
// Search & Filter
// ==========================================
function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    
    // Sync both inputs if typed in one
    if (e.target.id === 'searchInput') DOM.searchInputMobile.value = term;
    if (e.target.id === 'searchInputMobile') DOM.searchInput.value = term;

    const filtered = allSubscriptions.filter(sub => {
        const phone = (sub.phone || '').toLowerCase();
        const email = (sub.email || '').toLowerCase();
        const label = (sub.label || '').toLowerCase();
        return phone.includes(term) || email.includes(term) || label.includes(term);
    });
    
    renderCards(filtered);
}

// ==========================================
// Event Listeners Setup
// ==========================================
function setupEventListeners() {
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);
    DOM.adminLockBtn.addEventListener('click', handleLockClick);
    DOM.adminSubmitBtn.addEventListener('click', handleAdminLogin);
    
    // Password enter key
    DOM.adminPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminLogin();
    });

    DOM.addSubscriptionBtn.addEventListener('click', () => {
        editId = null;
        DOM.subForm.reset();
        DOM.subModalTitle.textContent = 'Add Subscription';
        openModal(DOM.subModal);
    });

    DOM.subForm.addEventListener('submit', handleSubFormSubmit);
    DOM.confirmDeleteBtn.addEventListener('click', handleDelete);
    DOM.paymentForm.addEventListener('submit', handlePaymentSubmit);
    
    DOM.searchInput.addEventListener('input', handleSearch);
    DOM.searchInputMobile.addEventListener('input', handleSearch);
}

// ==========================================
// Notifications & UI Helpers
// ==========================================
function requestNotificationPermission() {
    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }
}

function sendNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: "https://cdn-icons-png.flaticon.com/512/3233/3233483.png" // generic bell icon
        });
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const isError = type === 'error';
    const isSuccess = type === 'success';
    
    const icon = isError ? 'ph-warning-circle text-red-500' : 
                 isSuccess ? 'ph-check-circle text-emerald-500' : 'ph-info text-emerald-500';
                 
    toast.className = `toast-enter flex items-center gap-3 bg-white dark:bg-[#222630] border border-gray-100 dark:border-white/10 shadow-xl rounded-xl p-4 min-w-[250px]`;
    toast.innerHTML = `
        <i class="ph ${icon} text-xl"></i>
        <p class="text-sm font-medium text-gray-800 dark:text-gray-200">${message}</p>
    `;
    
    DOM.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.replace('toast-enter', 'toast-leave');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Start app
init();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}
