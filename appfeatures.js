/**
 * Attendance Tracker - Main Application
 * Handles CSV import, data management, filtering, and table rendering
 */

// ===================================
// Global State
// ===================================
let allData = [];
let enrollmentData = [];
let filteredData = [];
let currentSort = { column: 'Attendance_Date', direction: 'desc' };
let currentPage = 1;
const ITEMS_PER_PAGE = 25;
let currentSearchTerm = '';

// Enrollments state
let filteredEnrollments = [];
let enrollmentsSort = { column: 'studentName', direction: 'asc' };
let enrollmentsPage = 1;
let enrollmentsSearchTerm = '';

// Thresholds state
let thresholdsData = [];      // Students needing attention
let allThresholdsData = [];   // All students who have reached any threshold (for history view)

// ===================================
// DOM Cache
// ===================================
const DOM = {};

// ===================================
// LocalStorage Keys
// ===================================
const STORAGE_KEYS = {
    ATTENDANCE_DATA: 'attendanceTrackerData',
    ENROLLMENT_DATA: 'enrollmentTrackerData',
    ATTENDANCE_TIMESTAMP: 'attendanceImportTimestamp',
    ENROLLMENT_TIMESTAMP: 'enrollmentImportTimestamp',
    EMAIL_TEMPLATE_6TH: 'emailTemplate6th',
    EMAIL_TEMPLATE_8TH: 'emailTemplate8th',
    EMAIL_TEMPLATE_10TH: 'emailTemplate10th',
    SENT_EMAILS: 'sentEmails',
    STUDENT_THRESHOLDS_SNAPSHOT: 'studentThresholdsSnapshot',
    BCC_6TH: 'bccEmails6th',
    BCC_8TH: 'bccEmails8th',
    BCC_10TH: 'bccEmails10th'
};

// ===================================
// IndexedDB Setup
// ===================================
let db = null;
const DB_NAME = 'AttendanceTrackerDB';
const DB_VERSION = 1;

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create object stores if they don't exist
            if (!db.objectStoreNames.contains('attendanceData')) {
                db.createObjectStore('attendanceData');
            }
            if (!db.objectStoreNames.contains('enrollmentData')) {
                db.createObjectStore('enrollmentData');
            }
        };
    });
}

// ===================================
// IndexedDB Operations
// ===================================
function saveToIndexedDB(storeName, key, data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data, key);
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

function loadFromIndexedDB(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }
        
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ===================================
// Storage Operations
// ===================================
async function saveToLocalStorage(key, data) {
    try {
        const jsonString = JSON.stringify(data);
        
        // Try to save to localStorage first
        try {
            localStorage.setItem(key, jsonString);
            // Mark that we're using localStorage
            localStorage.setItem(key + '_storage', 'localStorage');
            return true;
        } catch (quotaError) {
            if (quotaError.name === 'QuotaExceededError') {
                console.warn('LocalStorage quota exceeded. Using IndexedDB instead...');
                
                // Use IndexedDB for large datasets
                if (Array.isArray(data)) {
                    const storeName = key === STORAGE_KEYS.ATTENDANCE_DATA ? 'attendanceData' : 
                                    key === STORAGE_KEYS.ENROLLMENT_DATA ? 'enrollmentData' : null;
                    
                    if (storeName && db) {
                        await saveToIndexedDB(storeName, key, data);
                        // Mark that we're using IndexedDB
                        localStorage.setItem(key + '_storage', 'indexedDB');
                        console.log(`Saved ${data.length} records to IndexedDB`);
                        return true;
                    }
                }
                
                throw quotaError;
            }
            throw quotaError;
        }
    } catch (e) {
        console.error('Error saving data:', e);
        alert('Unable to save data. Please try with a smaller dataset or clear browser storage.');
        return false;
    }
}

async function loadFromLocalStorage(key) {
    try {
        // Check where the data is stored
        const storageType = localStorage.getItem(key + '_storage');
        
        if (storageType === 'indexedDB') {
            // Load from IndexedDB
            const storeName = key === STORAGE_KEYS.ATTENDANCE_DATA ? 'attendanceData' : 
                            key === STORAGE_KEYS.ENROLLMENT_DATA ? 'enrollmentData' : null;
            
            if (storeName && db) {
                const data = await loadFromIndexedDB(storeName, key);
                console.log(`Loaded from IndexedDB: ${data ? data.length : 0} records`);
                return data || null;
            }
        }
        
        // Default: load from localStorage
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('Error loading data:', e);
        return null;
    }
}

// ===================================
// Data Loading
// ===================================
async function loadSavedData() {
    // Get DOM elements
    const importSuccessAttendance = document.getElementById('importSuccessAttendance');
    const timestampAttendance = document.getElementById('timestampAttendance');
    
    const importSuccessEnrollments = document.getElementById('importSuccessEnrollments');
    const timestampEnrollments = document.getElementById('timestampEnrollments');

    // Load attendance data
    const savedAttendanceData = await loadFromLocalStorage(STORAGE_KEYS.ATTENDANCE_DATA);
    const savedAttendanceTimestamp = await loadFromLocalStorage(STORAGE_KEYS.ATTENDANCE_TIMESTAMP);

    if (savedAttendanceData && savedAttendanceData.length > 0) {
        allData = savedAttendanceData;
        populateFilters();
        filteredData = [...allData];
        currentSort = { column: 'Attendance_Date', direction: 'desc' };
        applyCurrentSort();
        
        if (DOM.searchSection) DOM.searchSection.classList.remove('hidden');
        if (DOM.filterSection) DOM.filterSection.classList.remove('hidden');
        if (DOM.tableSection) DOM.tableSection.classList.remove('hidden');
        
        if (savedAttendanceTimestamp && timestampAttendance) {
            timestampAttendance.textContent = `Last imported: ${savedAttendanceTimestamp}`;
        }
        
        if (importSuccessAttendance) {
            importSuccessAttendance.classList.add('show');
        }
    }

    // Load enrollment data
    const savedEnrollmentData = await loadFromLocalStorage(STORAGE_KEYS.ENROLLMENT_DATA);
    const savedEnrollmentTimestamp = await loadFromLocalStorage(STORAGE_KEYS.ENROLLMENT_TIMESTAMP);

    if (savedEnrollmentData && savedEnrollmentData.length > 0) {
        enrollmentData = savedEnrollmentData;
        filteredEnrollments = [...enrollmentData];
        enrollmentsSort = { column: 'studentName', direction: 'asc' };
        applyEnrollmentsSort();
        
        if (DOM.enrollmentsSearchSection) DOM.enrollmentsSearchSection.classList.remove('hidden');
        if (DOM.enrollmentsTableSection) DOM.enrollmentsTableSection.classList.remove('hidden');
        
        if (savedEnrollmentTimestamp && timestampEnrollments) {
            timestampEnrollments.textContent = `Last imported: ${savedEnrollmentTimestamp}`;
        }
        
        if (importSuccessEnrollments) {
            importSuccessEnrollments.classList.add('show');
        }
    }
}

// ===================================
// CSV Parsing
// ===================================
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function parseCSV(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = parseCSVLine(lines[0]);
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            const values = parseCSVLine(lines[i]);
            const row = {};
            headers.forEach((header, index) => {
                row[header.trim()] = values[index] ? values[index].trim() : '';
            });
            data.push(row);
        }
        callback(data);
    };
    reader.readAsText(file);
}

function parseAttendanceCSV(file) {
    parseCSV(file, async (data) => {
        allData = data;
        await saveToLocalStorage(STORAGE_KEYS.ATTENDANCE_DATA, allData);
        populateFilters();
        filteredData = [...allData];
        currentSort = { column: 'Attendance_Date', direction: 'desc' };
        applyCurrentSort();
        if (DOM.searchSection) DOM.searchSection.classList.remove('hidden');
        if (DOM.filterSection) DOM.filterSection.classList.remove('hidden');
        if (DOM.tableSection) DOM.tableSection.classList.remove('hidden');
        await showImportSuccess('Attendance');
        // Re-render thresholds table if both datasets are available
        if (enrollmentData.length > 0) {
            renderThresholdsTable();
        }
    });
}

function parseEnrollmentsCSV(file) {
    parseCSV(file, async (data) => {
        enrollmentData = data;
        await saveToLocalStorage(STORAGE_KEYS.ENROLLMENT_DATA, enrollmentData);
        filteredEnrollments = [...enrollmentData];
        enrollmentsSort = { column: 'studentName', direction: 'asc' };
        applyEnrollmentsSort();
        if (DOM.enrollmentsSearchSection) DOM.enrollmentsSearchSection.classList.remove('hidden');
        if (DOM.enrollmentsTableSection) DOM.enrollmentsTableSection.classList.remove('hidden');
        await showImportSuccess('Enrollments');
        // Re-render thresholds table if both datasets are available
        if (allData.length > 0) {
            renderThresholdsTable();
        }
    });
}

// ===================================
// Filter Operations
// ===================================
function populateFilters() {
    const grades = [...new Set(allData.map(d => d.Grade))].filter(Boolean).sort((a,b) => a - b);
    const types = [...new Set(allData.map(d => d.Type))].filter(Boolean).sort();
    const blocks = [...new Set(allData.map(d => d.Block))].filter(Boolean).sort();
    const teachers = [...new Set(allData.map(d => d.Teacher_Last))].filter(Boolean).sort();

    if (DOM.filterGrade) populateSelect(DOM.filterGrade, grades, 'All Grades');
    if (DOM.filterType) populateSelect(DOM.filterType, types, 'All Types');
    if (DOM.filterBlock) populateSelect(DOM.filterBlock, blocks, 'All Blocks');
    if (DOM.filterTeacher) populateSelect(DOM.filterTeacher, teachers, 'All Teachers');
}

function populateSelect(select, options, defaultText) {
    select.innerHTML = `<option value="">${defaultText}</option>`;
    options.forEach(opt => {
        select.innerHTML += `<option value="${opt}">${opt}</option>`;
    });
}

function applyFilters() {
    filteredData = allData.filter(row => {
        // Search filter
        if (currentSearchTerm) {
            const searchLower = currentSearchTerm.toLowerCase();
            const studentName = `${row.Student_First || ''} ${row.Student_Last || ''}`.toLowerCase();
            const course = (row.Course || '').toLowerCase();
            const teacher = (row.Teacher_Last || '').toLowerCase();
            const comment = (row.Comment || '').toLowerCase();
            const excuse = (row.Excuse || '').toLowerCase();
            const type = (row.Type || '').toLowerCase();
            
            const matchesSearch = 
                studentName.includes(searchLower) ||
                course.includes(searchLower) ||
                teacher.includes(searchLower) ||
                comment.includes(searchLower) ||
                excuse.includes(searchLower) ||
                type.includes(searchLower);
            
            if (!matchesSearch) return false;
        }
        
        // Date range
        if (DOM.filterStartDate && DOM.filterStartDate.value) {
            const rowDate = parseLocalDate(row.Attendance_Date);
            const startDate = parseLocalDate(DOM.filterStartDate.value);
            if (rowDate && startDate && rowDate < startDate) return false;
        }
        if (DOM.filterEndDate && DOM.filterEndDate.value) {
            const rowDate = parseLocalDate(row.Attendance_Date);
            const endDate = parseLocalDate(DOM.filterEndDate.value);
            if (rowDate && endDate && rowDate > endDate) return false;
        }
        // Grade
        if (DOM.filterGrade && DOM.filterGrade.value && row.Grade !== DOM.filterGrade.value) return false;
        // Type
        if (DOM.filterType && DOM.filterType.value && row.Type !== DOM.filterType.value) return false;
        // Block
        if (DOM.filterBlock && DOM.filterBlock.value && row.Block !== DOM.filterBlock.value) return false;
        // Teacher
        if (DOM.filterTeacher && DOM.filterTeacher.value && row.Teacher_Last !== DOM.filterTeacher.value) return false;

        return true;
    });
    // Reset to page 1 when filters change
    currentPage = 1;
    // Update search hint
    updateSearchHint();
    // Re-apply current sort
    applyCurrentSort();
}

function performSearch(searchTerm) {
    currentSearchTerm = searchTerm.trim();
    
    // Update clear button visibility
    if (DOM.searchClear) {
        DOM.searchClear.classList.toggle('visible', currentSearchTerm.length > 0);
    }
    
    applyFilters();
}

function clearSearch() {
    currentSearchTerm = '';
    if (DOM.searchInput) {
        DOM.searchInput.value = '';
    }
    if (DOM.searchClear) {
        DOM.searchClear.classList.remove('visible');
    }
    applyFilters();
}

function updateSearchHint() {
    if (!DOM.searchHint) return;
    
    if (currentSearchTerm) {
        const total = allData.length;
        const filtered = filteredData.length;
        DOM.searchHint.textContent = `Found ${filtered} of ${total} records matching "${currentSearchTerm}"`;
    } else {
        DOM.searchHint.textContent = '';
    }
}

function clearFilters() {
    if (DOM.filterStartDate) DOM.filterStartDate.value = '';
    if (DOM.filterEndDate) DOM.filterEndDate.value = '';
    if (DOM.filterGrade) DOM.filterGrade.value = '';
    if (DOM.filterType) DOM.filterType.value = '';
    if (DOM.filterBlock) DOM.filterBlock.value = '';
    if (DOM.filterTeacher) DOM.filterTeacher.value = '';
    // Note: Preserve search term when clearing filters
    // Reset to page 1 when clearing filters
    currentPage = 1;
    // Re-apply filters (search will still be active if set)
    applyFilters();
}

// ===================================
// Sorting Operations
// ===================================
function compareValues(a, b, column, direction) {
    let valA, valB;

    if (column === 'studentName') {
        valA = `${a.Student_First || ''} ${a.Student_Last || ''}`.trim().toLowerCase();
        valB = `${b.Student_First || ''} ${b.Student_Last || ''}`.trim().toLowerCase();
    } else if (column === 'Attendance_Date') {
        valA = parseLocalDate(a[column]) || new Date(0);
        valB = parseLocalDate(b[column]) || new Date(0);
        return direction === 'asc' ? valA - valB : valB - valA;
    } else if (column === 'Grade') {
        valA = parseInt(a[column]) || 0;
        valB = parseInt(b[column]) || 0;
        return direction === 'asc' ? valA - valB : valB - valA;
    } else {
        valA = (a[column] || '').toLowerCase();
        valB = (b[column] || '').toLowerCase();
    }

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
}

function applyCurrentSort() {
    if (!currentSort.column) return;
    filteredData.sort((a, b) => compareValues(a, b, currentSort.column, currentSort.direction));
    updateSortIndicators();
    // Reset to page 1 when sorting changes
    currentPage = 1;
    renderTable();
}

function sortData(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    applyCurrentSort();
}

function updateSortIndicators() {
    const ths = document.querySelectorAll('th[data-sort]');
    ths.forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        const icon = th.querySelector('.sort-icon');
        icon.textContent = '';

        if (th.dataset.sort === currentSort.column) {
            if (currentSort.direction === 'asc') {
                th.classList.add('sort-asc');
                icon.textContent = '\u25B2';
            } else {
                th.classList.add('sort-desc');
                icon.textContent = '\u25BC';
            }
        }
    });
}

// ===================================
// Table Rendering
// ===================================
function renderTable() {
    if (!DOM.tableBody) return;
    
    DOM.tableBody.innerHTML = '';
    
    if (filteredData.length === 0) {
        if (DOM.emptyState) DOM.emptyState.classList.remove('hidden');
        if (DOM.recordCount) DOM.recordCount.textContent = '0 records';
        if (DOM.paginationTop) DOM.paginationTop.classList.add('hidden');
        if (DOM.paginationBottom) DOM.paginationBottom.classList.add('hidden');
        return;
    }
    
    if (DOM.emptyState) DOM.emptyState.classList.add('hidden');
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    // Update record count
    if (DOM.recordCount) {
        const start = filteredData.length === 0 ? 0 : startIndex + 1;
        DOM.recordCount.textContent = `Showing ${start}-${endIndex} of ${filteredData.length} record${filteredData.length !== 1 ? 's' : ''}`;
    }
    
    // Render only current page's rows
    pageData.forEach(row => {
        const tr = document.createElement('tr');
        
        const studentName = `${row.Student_First || ''} ${row.Student_Last || ''}`.trim();
        const typeClass = getTypeClass(row.Type);
        
        tr.innerHTML = `
            <td class="student-name">${escapeHtml(studentName)}</td>
            <td>${escapeHtml(row.Grade || '-')}</td>
            <td>${formatDate(row.Attendance_Date)}</td>
            <td><span class="type-badge ${typeClass}">${escapeHtml(row.Type || '-')}</span></td>
            <td>${escapeHtml(row.Excuse || '-')}</td>
            <td class="comment-cell" title="${escapeHtml(row.Comment || '')}">${escapeHtml(row.Comment || '-')}</td>
            <td>${escapeHtml(row.Course || '-')}</td>
            <td>${escapeHtml(row.Block || '-')}</td>
            <td>${escapeHtml(row.Teacher_Last || '-')}</td>
        `;
        DOM.tableBody.appendChild(tr);
    });
    
    // Update pagination controls
    updatePagination(totalPages);
}

function updatePagination(totalPages) {
    // Reset to page 1 if current page is out of bounds
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = 1;
        renderTable();
        return;
    }
    
    const shouldShow = totalPages > 1;
    
    // Update top pagination
    if (DOM.paginationTop) {
        if (shouldShow) {
            DOM.paginationTop.classList.remove('hidden');
        } else {
            DOM.paginationTop.classList.add('hidden');
        }
        
        const prevButtonTop = DOM.paginationTop.querySelector('.pagination-prev-top');
        const nextButtonTop = DOM.paginationTop.querySelector('.pagination-next-top');
        const pageInfoTop = DOM.paginationTop.querySelector('.pagination-info-top');
        
        if (prevButtonTop) {
            prevButtonTop.disabled = currentPage === 1;
            prevButtonTop.classList.toggle('disabled', currentPage === 1);
        }
        
        if (nextButtonTop) {
            nextButtonTop.disabled = currentPage === totalPages;
            nextButtonTop.classList.toggle('disabled', currentPage === totalPages);
        }
        
        if (pageInfoTop) {
            pageInfoTop.textContent = `Page ${currentPage} of ${totalPages}`;
        }
    }
    
    // Update bottom pagination
    if (DOM.paginationBottom) {
        if (shouldShow) {
            DOM.paginationBottom.classList.remove('hidden');
        } else {
            DOM.paginationBottom.classList.add('hidden');
        }
        
        const prevButtonBottom = DOM.paginationBottom.querySelector('.pagination-prev-bottom');
        const nextButtonBottom = DOM.paginationBottom.querySelector('.pagination-next-bottom');
        const pageInfoBottom = DOM.paginationBottom.querySelector('.pagination-info-bottom');
        
        if (prevButtonBottom) {
            prevButtonBottom.disabled = currentPage === 1;
            prevButtonBottom.classList.toggle('disabled', currentPage === 1);
        }
        
        if (nextButtonBottom) {
            nextButtonBottom.disabled = currentPage === totalPages;
            nextButtonBottom.classList.toggle('disabled', currentPage === totalPages);
        }
        
        if (pageInfoBottom) {
            pageInfoBottom.textContent = `Page ${currentPage} of ${totalPages}`;
        }
    }
}

function goToPage(page) {
    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderTable();
    }
}

function goToPreviousPage() {
    if (currentPage > 1) {
        goToPage(currentPage - 1);
    }
}

function goToNextPage() {
    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    if (currentPage < totalPages) {
        goToPage(currentPage + 1);
    }
}

// ===================================
// Enrollments Table Rendering
// ===================================
function renderEnrollmentsTable() {
    if (!DOM.enrollmentsTableBody) return;
    
    DOM.enrollmentsTableBody.innerHTML = '';
    
    if (filteredEnrollments.length === 0) {
        if (DOM.enrollmentsEmptyState) DOM.enrollmentsEmptyState.classList.remove('hidden');
        if (DOM.enrollmentsRecordCount) DOM.enrollmentsRecordCount.textContent = '0 records';
        if (DOM.enrollmentsPaginationTop) DOM.enrollmentsPaginationTop.classList.add('hidden');
        if (DOM.enrollmentsPaginationBottom) DOM.enrollmentsPaginationBottom.classList.add('hidden');
        return;
    }
    
    if (DOM.enrollmentsEmptyState) DOM.enrollmentsEmptyState.classList.add('hidden');
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredEnrollments.length / ITEMS_PER_PAGE);
    const startIndex = (enrollmentsPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredEnrollments.length);
    const pageData = filteredEnrollments.slice(startIndex, endIndex);
    
    // Update record count
    if (DOM.enrollmentsRecordCount) {
        const start = filteredEnrollments.length === 0 ? 0 : startIndex + 1;
        DOM.enrollmentsRecordCount.textContent = `Showing ${start}-${endIndex} of ${filteredEnrollments.length} record${filteredEnrollments.length !== 1 ? 's' : ''}`;
    }
    
    // Render only current page's rows
    pageData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Use correct column names from enrollment CSV
        const studentName = `${row.St_First || ''} ${row.St_Last || ''}`.trim();
        const courseTitle = row['Course Title'] || row.Course || '-';
        const teacherName = `${row.Teach_First || ''} ${row.Teach_Last || ''}`.trim() || '-';
        
        tr.innerHTML = `
            <td class="student-name">${escapeHtml(studentName)}</td>
            <td>${escapeHtml(row.Grade || '-')}</td>
            <td>${escapeHtml(courseTitle)}</td>
            <td>${escapeHtml(row.Block || '-')}</td>
            <td>${escapeHtml(teacherName)}</td>
        `;
        DOM.enrollmentsTableBody.appendChild(tr);
    });
    
    // Update pagination controls
    updateEnrollmentsPagination(totalPages);
}

function updateEnrollmentsPagination(totalPages) {
    // Reset to page 1 if current page is out of bounds
    if (enrollmentsPage > totalPages && totalPages > 0) {
        enrollmentsPage = 1;
        renderEnrollmentsTable();
        return;
    }
    
    const shouldShow = totalPages > 1;
    
    // Update top pagination
    if (DOM.enrollmentsPaginationTop) {
        if (shouldShow) {
            DOM.enrollmentsPaginationTop.classList.remove('hidden');
        } else {
            DOM.enrollmentsPaginationTop.classList.add('hidden');
        }
        
        const prevButtonTop = DOM.enrollmentsPaginationTop.querySelector('.pagination-prev-top-enrollments');
        const nextButtonTop = DOM.enrollmentsPaginationTop.querySelector('.pagination-next-top-enrollments');
        const pageInfoTop = DOM.enrollmentsPaginationTop.querySelector('.pagination-info-top-enrollments');
        
        if (prevButtonTop) {
            prevButtonTop.disabled = enrollmentsPage === 1;
            prevButtonTop.classList.toggle('disabled', enrollmentsPage === 1);
        }
        
        if (nextButtonTop) {
            nextButtonTop.disabled = enrollmentsPage === totalPages;
            nextButtonTop.classList.toggle('disabled', enrollmentsPage === totalPages);
        }
        
        if (pageInfoTop) {
            pageInfoTop.textContent = `Page ${enrollmentsPage} of ${totalPages}`;
        }
    }
    
    // Update bottom pagination
    if (DOM.enrollmentsPaginationBottom) {
        if (shouldShow) {
            DOM.enrollmentsPaginationBottom.classList.remove('hidden');
        } else {
            DOM.enrollmentsPaginationBottom.classList.add('hidden');
        }
        
        const prevButtonBottom = DOM.enrollmentsPaginationBottom.querySelector('.pagination-prev-bottom-enrollments');
        const nextButtonBottom = DOM.enrollmentsPaginationBottom.querySelector('.pagination-next-bottom-enrollments');
        const pageInfoBottom = DOM.enrollmentsPaginationBottom.querySelector('.pagination-info-bottom-enrollments');
        
        if (prevButtonBottom) {
            prevButtonBottom.disabled = enrollmentsPage === 1;
            prevButtonBottom.classList.toggle('disabled', enrollmentsPage === 1);
        }
        
        if (nextButtonBottom) {
            nextButtonBottom.disabled = enrollmentsPage === totalPages;
            nextButtonBottom.classList.toggle('disabled', enrollmentsPage === totalPages);
        }
        
        if (pageInfoBottom) {
            pageInfoBottom.textContent = `Page ${enrollmentsPage} of ${totalPages}`;
        }
    }
}

function goToEnrollmentsPage(page) {
    const totalPages = Math.ceil(filteredEnrollments.length / ITEMS_PER_PAGE);
    if (page >= 1 && page <= totalPages) {
        enrollmentsPage = page;
        renderEnrollmentsTable();
    }
}

function goToPreviousEnrollmentsPage() {
    if (enrollmentsPage > 1) {
        goToEnrollmentsPage(enrollmentsPage - 1);
    }
}

function goToNextEnrollmentsPage() {
    const totalPages = Math.ceil(filteredEnrollments.length / ITEMS_PER_PAGE);
    if (enrollmentsPage < totalPages) {
        goToEnrollmentsPage(enrollmentsPage + 1);
    }
}

function sortEnrollments(column) {
    if (enrollmentsSort.column === column) {
        enrollmentsSort.direction = enrollmentsSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        enrollmentsSort.column = column;
        enrollmentsSort.direction = 'asc';
    }
    applyEnrollmentsSort();
}

function applyEnrollmentsSort() {
    if (!enrollmentsSort.column) return;
    filteredEnrollments.sort((a, b) => compareEnrollmentValues(a, b, enrollmentsSort.column, enrollmentsSort.direction));
    updateEnrollmentsSortIndicators();
    enrollmentsPage = 1;
    renderEnrollmentsTable();
}

function applyEnrollmentsSearch() {
    filteredEnrollments = enrollmentData.filter(row => {
        if (enrollmentsSearchTerm) {
            const searchLower = enrollmentsSearchTerm.toLowerCase();
            const studentName = `${row.St_First || ''} ${row.St_Last || ''}`.toLowerCase();
            const course = (row['Course Title'] || row.Course || '').toLowerCase();
            const teacher = `${row.Teach_First || ''} ${row.Teach_Last || ''}`.toLowerCase();
            const block = (row.Block || '').toLowerCase();
            const grade = (row.Grade || '').toLowerCase();
            
            const matchesSearch = 
                studentName.includes(searchLower) ||
                course.includes(searchLower) ||
                teacher.includes(searchLower) ||
                block.includes(searchLower) ||
                grade.includes(searchLower);
            
            if (!matchesSearch) return false;
        }
        return true;
    });
    
    enrollmentsPage = 1;
    updateEnrollmentsSearchHint();
    applyEnrollmentsSort();
}

function performEnrollmentsSearch(searchTerm) {
    enrollmentsSearchTerm = searchTerm.trim();
    
    if (DOM.enrollmentsSearchClear) {
        DOM.enrollmentsSearchClear.classList.toggle('visible', enrollmentsSearchTerm.length > 0);
    }
    
    applyEnrollmentsSearch();
}

function clearEnrollmentsSearch() {
    enrollmentsSearchTerm = '';
    if (DOM.enrollmentsSearchInput) {
        DOM.enrollmentsSearchInput.value = '';
    }
    if (DOM.enrollmentsSearchClear) {
        DOM.enrollmentsSearchClear.classList.remove('visible');
    }
    applyEnrollmentsSearch();
}

function updateEnrollmentsSearchHint() {
    if (!DOM.enrollmentsSearchHint) return;
    
    if (enrollmentsSearchTerm) {
        const total = enrollmentData.length;
        const filtered = filteredEnrollments.length;
        DOM.enrollmentsSearchHint.textContent = `Found ${filtered} of ${total} records matching "${enrollmentsSearchTerm}"`;
    } else {
        DOM.enrollmentsSearchHint.textContent = '';
    }
}

function compareEnrollmentValues(a, b, column, direction) {
    let valA, valB;

    if (column === 'studentName') {
        valA = `${a.St_First || ''} ${a.St_Last || ''}`.trim().toLowerCase();
        valB = `${b.St_First || ''} ${b.St_Last || ''}`.trim().toLowerCase();
    } else if (column === 'Grade') {
        valA = parseInt(a[column]) || 0;
        valB = parseInt(b[column]) || 0;
        return direction === 'asc' ? valA - valB : valB - valA;
    } else if (column === 'Course') {
        valA = (a['Course Title'] || a.Course || '').toLowerCase();
        valB = (b['Course Title'] || b.Course || '').toLowerCase();
    } else if (column === 'Teacher_Last') {
        valA = `${a.Teach_First || ''} ${a.Teach_Last || ''}`.trim().toLowerCase();
        valB = `${b.Teach_First || ''} ${b.Teach_Last || ''}`.trim().toLowerCase();
    } else {
        valA = (a[column] || '').toLowerCase();
        valB = (b[column] || '').toLowerCase();
    }

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
}

function updateEnrollmentsSortIndicators() {
    const ths = document.querySelectorAll('th[data-sort-enrollments]');
    ths.forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        const icon = th.querySelector('.sort-icon');
        icon.textContent = '';

        if (th.dataset.sortEnrollments === enrollmentsSort.column) {
            if (enrollmentsSort.direction === 'asc') {
                th.classList.add('sort-asc');
                icon.textContent = '\u25B2';
            } else {
                th.classList.add('sort-desc');
                icon.textContent = '\u25BC';
            }
        }
    });
}

// ===================================
// Thresholds Logic
// ===================================
function extractBlockNumber(blockValue) {
    // Extract leading number from block (e.g., "1", "2 SEL", "3 DWI" -> 1, 2, 3)
    if (!blockValue) return null;
    const match = blockValue.toString().match(/^(\d+)/);
    return match ? parseInt(match[1]) : null;
}

function extractSID(nameWithSID) {
    // Extract SID from format "FirstName LastName - SID"
    if (!nameWithSID) return null;
    const parts = nameWithSID.split(' - ');
    if (parts.length >= 2) {
        return parts[parts.length - 1].trim();
    }
    return null;
}

function isReducedScheduleBlock(blockValue) {
    // Check if block is SEL or DWI (meets once/week vs twice/week)
    if (!blockValue) return false;
    const blockStr = blockValue.toString().toUpperCase();
    return blockStr.includes('SEL') || blockStr.includes('DWI');
}

function getThresholdForBlock(isReducedSchedule) {
    // SEL/DWI courses: 3, 4, 5 thresholds (meet once/week)
    // Regular courses: 6, 8, 10 thresholds (meet twice/week)
    return isReducedSchedule ? 3 : 6;
}

function getAllReachedThresholds(count, isReducedSchedule) {
    // Returns array of all threshold levels that have been reached
    // Each item: { level: 6|8|10, absenceCount: number }
    const thresholds = [];
    
    if (isReducedSchedule) {
        // SEL/DWI: 3, 4, 5 thresholds map to 6, 8, 10 levels
        if (count >= 3) thresholds.push({ level: 6, absenceCount: 3 });
        if (count >= 4) thresholds.push({ level: 8, absenceCount: 4 });
        if (count >= 5) thresholds.push({ level: 10, absenceCount: 5 });
    } else {
        // Regular: 6, 8, 10 thresholds
        if (count >= 6) thresholds.push({ level: 6, absenceCount: 6 });
        if (count >= 8) thresholds.push({ level: 8, absenceCount: 8 });
        if (count >= 10) thresholds.push({ level: 10, absenceCount: 10 });
    }
    
    return thresholds;
}

function buildThresholdsData() {
    // Need both datasets
    if (allData.length === 0 || enrollmentData.length === 0) {
        thresholdsData = [];
        allThresholdsData = [];
        return;
    }
    
    // Step 1: Build enrollment lookup by SID + block (prefer SID) or name + block
    // Key: "sid:SID|BlockNum" or "name:FirstName|LastName|BlockNum" -> { course, teacher, isReducedSchedule }
    const enrollmentLookup = {};
    const sidLookup = {}; // Map name -> SID for cross-referencing
    
    enrollmentData.forEach(row => {
        // Try to extract SID from the combined column
        const combinedName = row['St_First St_Last - SID'] || '';
        const sid = extractSID(combinedName);
        
        const firstName = (row.St_First || '').trim().toLowerCase();
        const lastName = (row.St_Last || '').trim().toLowerCase();
        const blockNum = extractBlockNumber(row.Block);
        const blockValue = row.Block || '';
        
        const enrollmentInfo = {
            course: row['Course Title'] || row.Course || '',
            teacher: `${row.Teach_First || ''} ${row.Teach_Last || ''}`.trim(),
            isReducedSchedule: isReducedScheduleBlock(blockValue)
        };
        
        if (blockNum) {
            // Store by SID if available
            if (sid) {
                enrollmentLookup[`sid:${sid}|${blockNum}`] = enrollmentInfo;
                // Also store SID lookup by name
                if (firstName && lastName) {
                    sidLookup[`${firstName}|${lastName}`] = sid;
                }
            }
            // Also store by name for fallback
            if (firstName && lastName) {
                enrollmentLookup[`name:${firstName}|${lastName}|${blockNum}`] = enrollmentInfo;
            }
        }
    });
    
    // Step 2: Count absences per student per block (excluding tardies)
    // Structure: { "sid:SID" or "name:First|Last": { sid, firstName, lastName, grade, blocks: { 1: { count, dates: [] }, ... } } }
    const studentAbsences = {};
    
    allData.forEach(row => {
        // Try to extract SID from the combined column
        const combinedName = row['Student_First Student_Last - SID'] || '';
        const sid = extractSID(combinedName);
        
        const firstName = (row.Student_First || '').trim();
        const lastName = (row.Student_Last || '').trim();
        const blockNum = extractBlockNumber(row.Block);
        const grade = row.Grade || '';
        const date = row.Attendance_Date || '';
        const excuse = row.Excuse || '';
        const comment = row.Comment || '';
        const type = (row.Type || '').toLowerCase();
        
        // Only count absences (Type contains "Absence" or "Absent"), exclude all tardies
        const isAbsence = type.includes('absence') || type.includes('absent');
        const isTardy = type.includes('tardy');
        if (isTardy || !isAbsence) return;
        
        if ((!firstName || !lastName) && !sid) return;
        if (!blockNum) return;
        
        // Use SID as primary key if available, otherwise use name
        const studentKey = sid ? `sid:${sid}` : `name:${firstName}|${lastName}`;
        
        if (!studentAbsences[studentKey]) {
            studentAbsences[studentKey] = {
                sid: sid || sidLookup[`${firstName.toLowerCase()}|${lastName.toLowerCase()}`] || null,
                firstName,
                lastName,
                grade,
                blocks: {}
            };
        }
        
        if (!studentAbsences[studentKey].blocks[blockNum]) {
            studentAbsences[studentKey].blocks[blockNum] = {
                count: 0,
                dates: []
            };
        }
        
        studentAbsences[studentKey].blocks[blockNum].count++;
        studentAbsences[studentKey].blocks[blockNum].dates.push({
            date,
            excuse,
            comment
        });
    });
    
    // Step 3: Filter to only students with at least one block meeting threshold
    // Regular courses: >= 6 absences, SEL/DWI courses: >= 3 absences
    thresholdsData = [];
    allThresholdsData = [];
    
    Object.keys(studentAbsences).forEach(studentKey => {
        const student = studentAbsences[studentKey];
        let hasThreshold = false;
        
        // Check if any block meets its threshold (varies by course type)
        for (let b = 1; b <= 8; b++) {
            if (student.blocks[b]) {
                // Look up enrollment by SID first, then by name
                let enrollment = {};
                if (student.sid) {
                    enrollment = enrollmentLookup[`sid:${student.sid}|${b}`] || {};
                }
                if (!enrollment.course) {
                    enrollment = enrollmentLookup[`name:${student.firstName.toLowerCase()}|${student.lastName.toLowerCase()}|${b}`] || {};
                }
                const threshold = getThresholdForBlock(enrollment.isReducedSchedule);
                
                if (student.blocks[b].count >= threshold) {
                    hasThreshold = true;
                    break;
                }
            }
        }
        
        if (!hasThreshold) return;
        
        // Build row data with all 8 blocks
        const rowData = {
            sid: student.sid,
            firstName: student.firstName,
            lastName: student.lastName,
            grade: student.grade,
            blocks: {},
            needsAttention: false, // Will be set to true if any block needs attention
            needsAttentionCount: 0 // Count of blocks needing attention
        };
        
        for (let b = 1; b <= 8; b++) {
            const blockData = student.blocks[b];
            // Look up enrollment by SID first, then by name
            let enrollment = {};
            if (student.sid) {
                enrollment = enrollmentLookup[`sid:${student.sid}|${b}`] || {};
            }
            if (!enrollment.course) {
                enrollment = enrollmentLookup[`name:${student.firstName.toLowerCase()}|${student.lastName.toLowerCase()}|${b}`] || {};
            }
            const isReducedSchedule = enrollment.isReducedSchedule || false;
            const count = blockData ? blockData.count : 0;
            const threshold = getThresholdForBlock(isReducedSchedule);
            
            // Calculate threshold level for this block
            let thresholdLevel = 0;
            if (count >= threshold) {
                if (isReducedSchedule) {
                    if (count >= 5) thresholdLevel = 10;
                    else if (count >= 4) thresholdLevel = 8;
                    else thresholdLevel = 6;
                } else {
                    if (count >= 10) thresholdLevel = 10;
                    else if (count >= 8) thresholdLevel = 8;
                    else if (count >= 6) thresholdLevel = 6;
                }
            }
            
            // Check if this block needs attention (threshold reached but email not sent)
            const blockNeedsAttention = thresholdLevel > 0 && 
                isNewThreshold(student.sid, student.firstName, student.lastName, b, thresholdLevel);
            
            if (blockNeedsAttention) {
                rowData.needsAttention = true;
                rowData.needsAttentionCount++;
            }
            
            rowData.blocks[b] = {
                count: count,
                dates: blockData ? blockData.dates.sort((a, b) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return dateA - dateB;
                }) : [],
                course: enrollment.course || '',
                teacher: enrollment.teacher || '',
                isReducedSchedule: isReducedSchedule,
                thresholdLevel: thresholdLevel,
                needsAttention: blockNeedsAttention
            };
        }
        
        // Add to allThresholdsData (history view - all students who reached any threshold)
        allThresholdsData.push(rowData);
        
        // Only include students who have at least one block needing attention in thresholdsData
        if (rowData.needsAttention) {
            thresholdsData.push(rowData);
        }
    });
    
    // Sort thresholdsData: by count of blocks needing attention (more first), then alphabetically
    thresholdsData.sort((a, b) => {
        // By count of blocks needing attention (more first)
        if (a.needsAttentionCount !== b.needsAttentionCount) {
            return b.needsAttentionCount - a.needsAttentionCount;
        }
        // Then alphabetically
        const lastCmp = a.lastName.toLowerCase().localeCompare(b.lastName.toLowerCase());
        if (lastCmp !== 0) return lastCmp;
        return a.firstName.toLowerCase().localeCompare(b.firstName.toLowerCase());
    });
    
    // Sort allThresholdsData alphabetically
    allThresholdsData.sort((a, b) => {
        const lastCmp = a.lastName.toLowerCase().localeCompare(b.lastName.toLowerCase());
        if (lastCmp !== 0) return lastCmp;
        return a.firstName.toLowerCase().localeCompare(b.firstName.toLowerCase());
    });
}

function renderThresholdsTable() {
    // Check if we have both datasets
    if (allData.length === 0 || enrollmentData.length === 0) {
        if (DOM.thresholdsNoData) DOM.thresholdsNoData.classList.remove('hidden');
        if (DOM.thresholdsTableSection) DOM.thresholdsTableSection.classList.add('hidden');
        if (DOM.historyTableSection) DOM.historyTableSection.classList.add('hidden');
        if (DOM.thresholdTabs) DOM.thresholdTabs.classList.add('hidden');
        return;
    }
    
    if (DOM.thresholdsNoData) DOM.thresholdsNoData.classList.add('hidden');
    if (DOM.thresholdsTableSection) DOM.thresholdsTableSection.classList.remove('hidden');
    if (DOM.thresholdTabs) DOM.thresholdTabs.classList.remove('hidden');
    
    // Build the data
    buildThresholdsData();
    
    if (!DOM.thresholdsTableBody) return;
    
    DOM.thresholdsTableBody.innerHTML = '';
    
    if (thresholdsData.length === 0) {
        if (DOM.thresholdsEmptyState) DOM.thresholdsEmptyState.classList.remove('hidden');
        if (DOM.thresholdsRecordCount) DOM.thresholdsRecordCount.textContent = '0 students';
        return;
    }
    
    if (DOM.thresholdsEmptyState) DOM.thresholdsEmptyState.classList.add('hidden');
    if (DOM.thresholdsRecordCount) {
        if (thresholdsData.length > 0) {
            DOM.thresholdsRecordCount.innerHTML = `<span class="attention-count">${thresholdsData.length} student${thresholdsData.length !== 1 ? 's' : ''} need${thresholdsData.length !== 1 ? '' : 's'} attention</span>`;
        } else {
            DOM.thresholdsRecordCount.textContent = `All emails sent ✓`;
        }
    }
    
    thresholdsData.forEach(student => {
        const tr = document.createElement('tr');
        // Store student data on the row for email generation
        tr.dataset.sid = student.sid || '';
        tr.dataset.firstName = student.firstName;
        tr.dataset.lastName = student.lastName;
        tr.dataset.grade = student.grade;
        
        // Add class for needs attention row
        if (student.needsAttention) {
            tr.classList.add('needs-attention');
        }
        
        // Build email history log for this student (for expandable section)
        const sentEmailsHistory = getAllSentEmailsForStudent(student.sid, student.firstName, student.lastName);
        const hasHistory = sentEmailsHistory.length > 0;
        
        let historyHtml = '';
        if (hasHistory) {
            historyHtml = '<div class="email-history-dropdown">';
            sentEmailsHistory.forEach(email => {
                const dateStr = formatSentDateFull(email.dateSent);
                const thresholdLabel = email.thresholdLevel === 6 ? '6th' : 
                                       email.thresholdLevel === 8 ? '8th' : '10th';
                const blockLabel = email.block ? `B${email.block}` : '';
                historyHtml += `<div class="email-history-item">
                    <span class="history-course">${escapeHtml(email.courseName)}</span>
                    ${blockLabel ? `<span class="history-block">${blockLabel}</span>` : ''}
                    <span class="history-threshold">${thresholdLabel}</span>
                    <span class="history-date">${dateStr}</span>
                </div>`;
            });
            historyHtml += '</div>';
        }

        // Show expand arrow only if there's history
        const expandArrow = hasHistory ? '<span class="expand-arrow">▶</span>' : '';
        
        let rowHtml = `
            <td class="student-name-cell ${hasHistory ? 'has-history' : ''}">
                <div class="student-name-row">
                    <span class="student-name">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</span>
                    ${expandArrow}
                </div>
                ${historyHtml}
            </td>
            <td>${escapeHtml(student.grade || '-')}</td>
        `;
        
        // Add block cells
        for (let b = 1; b <= 8; b++) {
            const block = student.blocks[b];
            const threshold = getThresholdForBlock(block.isReducedSchedule);
            
            if (block.count >= threshold) {
                const scheduleNote = block.isReducedSchedule ? ' (SEL/DWI - 1x/week)' : '';
                const datesHtml = block.dates.map(d => {
                    const dateStr = formatDate(d.date);
                    const excuseStr = d.excuse ? ` - ${escapeHtml(d.excuse)}` : '';
                    const commentStr = d.comment ? ` (${escapeHtml(d.comment)})` : '';
                    return `<div>${dateStr}${excuseStr}${commentStr}</div>`;
                }).join('');
                
                // Get all thresholds that have been reached
                const reachedThresholds = getAllReachedThresholds(block.count, block.isReducedSchedule);
                const currentThreshold = reachedThresholds[reachedThresholds.length - 1]; // Highest threshold
                
                // Check if current threshold email has been sent
                const currentSent = isEmailSent(student.sid, student.firstName, student.lastName, b, currentThreshold.level);
                
                // If email already sent, show empty cell (history is in dropdown)
                if (currentSent) {
                    rowHtml += `<td class="threshold-cell empty">-</td>`;
                } else {
                    // Show badge for absences needing attention
                    const badgesHtml = `<span class="threshold-badge current-badge" data-threshold="${currentThreshold.level}" title="Needs attention - email not sent">${block.count}</span>`;
                    
                    rowHtml += `
                        <td class="threshold-cell" data-block="${b}" data-threshold="${currentThreshold.level}" data-course="${escapeHtml(block.course) || ''}">
                            <div class="threshold-badges-container">
                                ${badgesHtml}
                            </div>
                            <div class="threshold-details">
                                <div class="threshold-details-header">
                                    <div class="threshold-details-course">${escapeHtml(block.course) || 'Unknown Course'}${scheduleNote}</div>
                                    <div class="threshold-details-footer">
                                        <button class="btn-quick-sent" data-block="${b}" title="Mark as Sent">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        </button>
                                        <button class="btn-send-email" data-block="${b}">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>
                                            </svg>
                                            Compose Email
                                        </button>
                                    </div>
                                </div>
                                <div class="threshold-details-teacher">${escapeHtml(block.teacher) || 'Unknown Teacher'}</div>
                                <div class="threshold-details-dates">${datesHtml || 'No dates'}</div>
                            </div>
                        </td>
                    `;
                }
            } else {
                rowHtml += `<td class="threshold-cell empty">-</td>`;
            }
        }
        
        tr.innerHTML = rowHtml;
        DOM.thresholdsTableBody.appendChild(tr);
    });
    
    // Add click handlers for expandable cells
    DOM.thresholdsTableBody.querySelectorAll('.threshold-cell:not(.empty)').forEach(cell => {
        cell.addEventListener('click', (e) => {
            // Check if clicking inside the threshold-details popup (but not on a button)
            const detailsPopup = e.target.closest('.threshold-details');
            const emailBtn = e.target.closest('.btn-send-email');
            const quickSentBtn = e.target.closest('.btn-quick-sent');

            // If clicking inside the details popup but not on a button, do nothing
            if (detailsPopup && !emailBtn && !quickSentBtn) {
                e.stopPropagation();
                return;
            }

            // Check if clicking on the quick mark as sent button
            if (quickSentBtn) {
                e.stopPropagation();

                const row = cell.closest('tr');
                const sid = row.dataset.sid || null;
                const firstName = row.dataset.firstName;
                const lastName = row.dataset.lastName;
                const blockId = parseInt(cell.dataset.block);
                const thresholdLevel = parseInt(cell.dataset.threshold);
                const courseName = cell.dataset.course || 'Unknown Course';

                // Mark as sent
                markEmailAsSent(sid, firstName, lastName, blockId, thresholdLevel, courseName);
                updateThresholdsSnapshot(sid, firstName, lastName, blockId, thresholdLevel);

                // Re-render table to update UI
                renderThresholdsTable();
                return;
            }

            // Check if clicking on the send email button
            if (emailBtn && !emailBtn.classList.contains('sent')) {
                e.stopPropagation();

                // Get student data from the row
                const row = cell.closest('tr');
                const sid = row.dataset.sid || null;
                const firstName = row.dataset.firstName;
                const lastName = row.dataset.lastName;
                const grade = row.dataset.grade;
                const blockId = parseInt(cell.dataset.block);
                const courseName = cell.dataset.course || ''; // Get course name from cell

                // Open email modal for this student/block
                openEmailModalForStudent({ sid, firstName, lastName, grade, courseName }, blockId);
                return;
            }
            
            // Close any other open cells
            DOM.thresholdsTableBody.querySelectorAll('.threshold-cell.expanded').forEach(c => {
                if (c !== cell) {
                    c.classList.remove('expanded');
                    const details = c.querySelector('.threshold-details');
                    if (details) {
                        details.style.left = '';
                        details.style.top = '';
                    }
                }
            });
            // Toggle this cell
            const isExpanding = !cell.classList.contains('expanded');
            cell.classList.toggle('expanded');
            
            // Position the popup to avoid overflow (using fixed positioning)
            if (isExpanding) {
                // Use setTimeout to ensure the popup is rendered before measuring
                setTimeout(() => {
                    const details = cell.querySelector('.threshold-details');
                    if (details && cell.classList.contains('expanded')) {
                        // Get cell position in viewport
                        const cellRect = cell.getBoundingClientRect();
                        const viewportWidth = window.innerWidth;
                        const viewportHeight = window.innerHeight;
                        
                        // Temporarily show to measure
                        details.style.visibility = 'hidden';
                        details.style.left = '0';
                        details.style.top = '0';
                        void details.offsetWidth;
                        const popupWidth = details.offsetWidth;
                        const popupHeight = details.offsetHeight;
                        
                        // Calculate horizontal position (center on cell, but stay in viewport)
                        let left = cellRect.left + (cellRect.width / 2) - (popupWidth / 2);
                        
                        // Keep within viewport horizontally
                        if (left + popupWidth > viewportWidth - 10) {
                            left = viewportWidth - popupWidth - 10;
                        }
                        if (left < 10) {
                            left = 10;
                        }
                        
                        // Calculate vertical position (prefer below, but flip if needed)
                        const spaceBelow = viewportHeight - cellRect.bottom;
                        const spaceAbove = cellRect.top;
                        let top;
                        
                        if (spaceBelow >= popupHeight + 10) {
                            // Position below the cell
                            top = cellRect.bottom + 5;
                        } else if (spaceAbove >= popupHeight + 10) {
                            // Position above the cell
                            top = cellRect.top - popupHeight - 5;
                        } else {
                            // Not enough space either way, position below and let it scroll
                            top = cellRect.bottom + 5;
                            // Cap to keep some of it visible
                            if (top + popupHeight > viewportHeight - 10) {
                                top = viewportHeight - popupHeight - 10;
                            }
                        }
                        
                        // Apply position
                        details.style.left = left + 'px';
                        details.style.top = top + 'px';
                        details.style.visibility = '';
                    }
                }, 0);
            }
        });
    });
    
    // Also render history table
    renderHistoryTable();
}

function renderHistoryTable() {
    if (!DOM.historyTableBody) return;
    
    // Show/hide sections based on data availability
    if (allData.length === 0 || enrollmentData.length === 0) {
        if (DOM.historyTableSection) DOM.historyTableSection.classList.add('hidden');
        return;
    }
    
    if (DOM.historyTableSection) DOM.historyTableSection.classList.remove('hidden');
    
    DOM.historyTableBody.innerHTML = '';
    
    if (allThresholdsData.length === 0) {
        if (DOM.historyEmptyState) DOM.historyEmptyState.classList.remove('hidden');
        if (DOM.historyRecordCount) DOM.historyRecordCount.textContent = '0 students';
        return;
    }
    
    if (DOM.historyEmptyState) DOM.historyEmptyState.classList.add('hidden');
    if (DOM.historyRecordCount) {
        DOM.historyRecordCount.textContent = `${allThresholdsData.length} student${allThresholdsData.length !== 1 ? 's' : ''}`;
    }
    
    allThresholdsData.forEach(student => {
        const tr = document.createElement('tr');
        tr.dataset.sid = student.sid || '';
        tr.dataset.firstName = student.firstName;
        tr.dataset.lastName = student.lastName;
        tr.dataset.grade = student.grade;
        
        // Build email history log for this student (for expandable section)
        const sentEmailsHistory = getAllSentEmailsForStudent(student.sid, student.firstName, student.lastName);
        const hasHistory = sentEmailsHistory.length > 0;
        
        let historyHtml = '';
        if (hasHistory) {
            historyHtml = '<div class="email-history-dropdown">';
            sentEmailsHistory.forEach(email => {
                const dateStr = formatSentDateFull(email.dateSent);
                const thresholdLabel = email.thresholdLevel === 6 ? '6th' : 
                                       email.thresholdLevel === 8 ? '8th' : '10th';
                const blockLabel = email.block ? `B${email.block}` : '';
                historyHtml += `<div class="email-history-item">
                    <span class="history-course">${escapeHtml(email.courseName)}</span>
                    ${blockLabel ? `<span class="history-block">${blockLabel}</span>` : ''}
                    <span class="history-threshold">${thresholdLabel}</span>
                    <span class="history-date">${dateStr}</span>
                </div>`;
            });
            historyHtml += '</div>';
        }

        const expandArrow = hasHistory ? '<span class="expand-arrow">▶</span>' : '';
        
        let rowHtml = `
            <td class="student-name-cell ${hasHistory ? 'has-history' : ''}">
                <div class="student-name-row">
                    <span class="student-name">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</span>
                    ${expandArrow}
                </div>
                ${historyHtml}
            </td>
            <td>${escapeHtml(student.grade || '-')}</td>
        `;
        
        // Render each block column - show all badges (both sent and needs attention)
        for (let b = 1; b <= 8; b++) {
            const block = student.blocks[b];
            if (block && block.thresholdLevel > 0) {
                const scheduleNote = block.isReducedSchedule ? ' (SEL/DWI - 1x/week)' : '';
                const datesHtml = block.dates.map(d => {
                    const dateStr = formatDate(d.date);
                    const excuseStr = d.excuse ? ` - ${escapeHtml(d.excuse)}` : '';
                    const commentStr = d.comment ? ` (${escapeHtml(d.comment)})` : '';
                    return `<div>${dateStr}${excuseStr}${commentStr}</div>`;
                }).join('');
                
                // Check if current threshold email has been sent
                const currentSent = isEmailSent(student.sid, student.firstName, student.lastName, b, block.thresholdLevel);
                const sentClass = currentSent ? 'sent' : '';
                
                const badgesHtml = `<span class="threshold-badge current-badge ${sentClass}" data-threshold="${block.thresholdLevel}" title="${currentSent ? 'Email sent' : 'Needs attention'}">${block.count}</span>`;
                
                rowHtml += `
                    <td class="threshold-cell history-cell" data-block="${b}" data-course="${escapeHtml(block.course) || ''}">
                        <div class="threshold-badges-container">
                            ${badgesHtml}
                        </div>
                        <div class="threshold-details">
                            <div class="threshold-details-header">
                                <div class="threshold-details-course">${escapeHtml(block.course) || 'Unknown Course'}${scheduleNote}</div>
                            </div>
                            <div class="threshold-details-teacher">${escapeHtml(block.teacher) || 'Unknown Teacher'}</div>
                            <div class="threshold-details-dates">${datesHtml || 'No dates'}</div>
                        </div>
                    </td>
                `;
            } else {
                rowHtml += `<td class="threshold-cell empty">-</td>`;
            }
        }
        
        tr.innerHTML = rowHtml;
        DOM.historyTableBody.appendChild(tr);
    });
    
    // Add click handlers for expandable cells in history table
    DOM.historyTableBody.querySelectorAll('.threshold-cell:not(.empty)').forEach(cell => {
        cell.addEventListener('click', (e) => {
            const detailsPopup = e.target.closest('.threshold-details');
            if (detailsPopup) {
                e.stopPropagation();
                return;
            }
            
            // Close any other open cells in history table
            DOM.historyTableBody.querySelectorAll('.threshold-cell.expanded').forEach(c => {
                if (c !== cell) {
                    c.classList.remove('expanded');
                    const details = c.querySelector('.threshold-details');
                    if (details) {
                        details.style.left = '';
                        details.style.top = '';
                    }
                }
            });
            
            cell.classList.toggle('expanded');
            
            if (cell.classList.contains('expanded')) {
                const details = cell.querySelector('.threshold-details');
                if (details) {
                    details.style.visibility = 'hidden';
                    
                    setTimeout(() => {
                        const cellRect = cell.getBoundingClientRect();
                        const popupRect = details.getBoundingClientRect();
                        const popupWidth = popupRect.width || 280;
                        const popupHeight = popupRect.height || 200;
                        const viewportWidth = window.innerWidth;
                        const viewportHeight = window.innerHeight;
                        
                        let left = cellRect.left + (cellRect.width / 2) - (popupWidth / 2);
                        if (left < 10) left = 10;
                        if (left + popupWidth > viewportWidth - 10) {
                            left = viewportWidth - popupWidth - 10;
                        }
                        
                        const spaceBelow = viewportHeight - cellRect.bottom;
                        const spaceAbove = cellRect.top;
                        let top;
                        
                        if (spaceBelow >= popupHeight + 10) {
                            top = cellRect.bottom + 5;
                        } else if (spaceAbove >= popupHeight + 10) {
                            top = cellRect.top - popupHeight - 5;
                        } else {
                            top = cellRect.bottom + 5;
                            if (top + popupHeight > viewportHeight - 10) {
                                top = viewportHeight - popupHeight - 10;
                            }
                        }
                        
                        details.style.left = left + 'px';
                        details.style.top = top + 'px';
                        details.style.visibility = '';
                    }, 0);
                }
            }
        });
    });
}

// ===================================
// Utility Functions
// ===================================
function getTypeClass(type) {
    if (!type) return 'type-other';
    const t = type.toLowerCase();
    if (t.includes('absence')) return 'type-absence';
    if (t.includes('tardy')) return 'type-tardy';
    return 'type-other';
}

// Parse a date string as LOCAL time to avoid UTC timezone shifts.
// Handles YYYY-MM-DD, YYYY/MM/DD, M/D/YY, M/D/YYYY, MM/DD/YYYY, etc.
function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    // ISO-like: YYYY-MM-DD or YYYY/MM/DD (optional time ignored for date-only)
    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (m) {
        return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    }
    // US-style: M/D/YY or M/D/YYYY (also supports dashes)
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) {
        let year = parseInt(m[3]);
        if (year < 100) year += year < 70 ? 2000 : 1900;
        return new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
    }
    // Fallback: let JS try (may still have TZ issues for ISO, but better than nothing)
    const d = new Date(s);
    return isNaN(d) ? null : d;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = parseLocalDate(dateStr);
    if (!date || isNaN(date)) return dateStr;
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===================================
// Import Success Display
// ===================================
function formatTimestamp() {
    return new Date().toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

async function showImportSuccess(type) {
    const timestamp = formatTimestamp();
    const timestampEl = document.getElementById(`timestamp${type}`);
    const successEl = document.getElementById(`importSuccess${type}`);
    const storageKey = type === 'Attendance' 
        ? STORAGE_KEYS.ATTENDANCE_TIMESTAMP 
        : STORAGE_KEYS.ENROLLMENT_TIMESTAMP;

    if (timestampEl) timestampEl.textContent = `Last imported: ${timestamp}`;
    await saveToLocalStorage(storageKey, timestamp);
    if (successEl) successEl.classList.add('show');
}

// ===================================
// DOM Cache Initialization
// ===================================
function cacheDOM() {
    DOM.filterSection = document.getElementById('filterSection');
    DOM.tableSection = document.getElementById('tableSection');
    DOM.tableBody = document.getElementById('tableBody');
    DOM.recordCount = document.getElementById('recordCount');
    DOM.emptyState = document.getElementById('emptyState');
    DOM.paginationTop = document.getElementById('paginationTop');
    DOM.paginationBottom = document.getElementById('paginationBottom');
    DOM.filterStartDate = document.getElementById('filterStartDate');
    DOM.filterEndDate = document.getElementById('filterEndDate');
    DOM.filterGrade = document.getElementById('filterGrade');
    DOM.filterType = document.getElementById('filterType');
    DOM.filterBlock = document.getElementById('filterBlock');
    DOM.filterTeacher = document.getElementById('filterTeacher');
    
    // Search DOM elements
    DOM.searchSection = document.getElementById('searchSection');
    DOM.searchInput = document.getElementById('searchInput');
    DOM.searchClear = document.getElementById('searchClear');
    DOM.searchHint = document.getElementById('searchHint');
    
    // Enrollments DOM elements
    DOM.enrollmentsTableSection = document.getElementById('enrollmentsTableSection');
    DOM.enrollmentsTableBody = document.getElementById('enrollmentsTableBody');
    DOM.enrollmentsRecordCount = document.getElementById('enrollmentsRecordCount');
    DOM.enrollmentsEmptyState = document.getElementById('enrollmentsEmptyState');
    DOM.enrollmentsPaginationTop = document.getElementById('enrollmentsPaginationTop');
    DOM.enrollmentsPaginationBottom = document.getElementById('enrollmentsPaginationBottom');
    
    // Enrollments Search DOM elements
    DOM.enrollmentsSearchSection = document.getElementById('enrollmentsSearchSection');
    DOM.enrollmentsSearchInput = document.getElementById('enrollmentsSearchInput');
    DOM.enrollmentsSearchClear = document.getElementById('enrollmentsSearchClear');
    DOM.enrollmentsSearchHint = document.getElementById('enrollmentsSearchHint');
    
    // Thresholds DOM elements
    DOM.thresholdsTableSection = document.getElementById('thresholdsTableSection');
    DOM.thresholdsTableBody = document.getElementById('thresholdsTableBody');
    DOM.thresholdsRecordCount = document.getElementById('thresholdsRecordCount');
    DOM.thresholdsEmptyState = document.getElementById('thresholdsEmptyState');
    DOM.thresholdsNoData = document.getElementById('thresholdsNoData');
    
    // History view DOM elements
    DOM.historyTableSection = document.getElementById('historyTableSection');
    DOM.historyTableBody = document.getElementById('historyTableBody');
    DOM.historyRecordCount = document.getElementById('historyRecordCount');
    DOM.historyEmptyState = document.getElementById('historyEmptyState');
    
    // Threshold tabs
    DOM.thresholdTabs = document.getElementById('thresholdTabs');
    DOM.attentionView = document.getElementById('attentionView');
    DOM.historyView = document.getElementById('historyView');
}

// ===================================
// Mail Merge State
// ===================================
let currentEmailStudent = null;
let currentEmailBlock = null;
let sentEmails = {}; // { "firstName|lastName|block|threshold": true }

// ===================================
// Email Template Functions
// ===================================
function setupTemplateEditor(grade) {
    const editor = document.getElementById(`template${grade}`);
    const saveIndicator = document.getElementById(`saveIndicator${grade}`);
    
    if (!editor) return;
    
    let saveTimeout;
    
    // Load saved content
    const storageKey = STORAGE_KEYS[`EMAIL_TEMPLATE_${grade.toUpperCase()}`];
    const savedContent = localStorage.getItem(storageKey);
    if (savedContent) {
        editor.innerHTML = savedContent;
    }
    
    // Auto-save on input
    editor.addEventListener('input', () => {
        // Clear previous timeout
        clearTimeout(saveTimeout);
        
        // Hide save indicator
        if (saveIndicator) saveIndicator.classList.remove('visible');
        
        // Save after a short delay (debounce)
        saveTimeout = setTimeout(() => {
            localStorage.setItem(storageKey, editor.innerHTML);
            
            // Show save indicator
            if (saveIndicator) {
                saveIndicator.classList.add('visible');
                
                // Hide after 2 seconds
                setTimeout(() => {
                    saveIndicator.classList.remove('visible');
                }, 2000);
            }
        }, 500);
    });
    
    // Handle paste - preserve formatting from Google Docs
    editor.addEventListener('paste', (e) => {
        // Let the browser handle the paste with HTML formatting
        // The contenteditable will preserve most formatting from Google Docs
    });
}

function setupBccField(fieldId, storageKey, defaultValue = '') {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    // Load saved value or use default
    const savedValue = localStorage.getItem(storageKey);
    if (savedValue !== null) {
        field.value = savedValue;
    } else if (defaultValue) {
        field.value = defaultValue;
        localStorage.setItem(storageKey, defaultValue);
    }
    
    // Auto-save on input (debounced)
    let saveTimeout;
    field.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            localStorage.setItem(storageKey, field.value);
        }, 500);
    });
    
    // Save on blur as well
    field.addEventListener('blur', () => {
        localStorage.setItem(storageKey, field.value);
    });
}

function copyTemplateToClipboard(grade) {
    const editor = document.getElementById(`template${grade}`);
    const btn = document.querySelector(`.btn-copy[data-template="${grade}"]`);
    
    if (!editor) return;
    
    // Get the HTML content
    const content = editor.innerHTML;
    
    // Try to copy as rich text
    const blob = new Blob([content], { type: 'text/html' });
    const plainText = editor.innerText;
    
    // Use Clipboard API if available
    if (navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([
            new ClipboardItem({
                'text/html': blob,
                'text/plain': new Blob([plainText], { type: 'text/plain' })
            })
        ]).then(() => {
            showCopySuccess(btn);
        }).catch(() => {
            // Fallback to plain text
            navigator.clipboard.writeText(plainText).then(() => {
                showCopySuccess(btn);
            });
        });
    } else {
        // Fallback for older browsers
        navigator.clipboard.writeText(plainText).then(() => {
            showCopySuccess(btn);
        });
    }
}

function showCopySuccess(btn) {
    if (!btn) return;
    
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
    `;
    btn.style.backgroundColor = '#7dd3fc';
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.backgroundColor = '';
    }, 1500);
}

// ===================================
// Sent Emails Tracking
// ===================================
function loadSentEmails() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.SENT_EMAILS);
        sentEmails = saved ? JSON.parse(saved) : {};
        
        // Migrate old format (true) to new format ({ dateSent })
        let needsSave = false;
        Object.keys(sentEmails).forEach(key => {
            if (sentEmails[key] === true) {
                sentEmails[key] = { dateSent: null }; // Unknown date for old entries
                needsSave = true;
            }
        });
        if (needsSave) {
            saveSentEmails();
        }
    } catch (e) {
        sentEmails = {};
    }
}

function saveSentEmails() {
    try {
        localStorage.setItem(STORAGE_KEYS.SENT_EMAILS, JSON.stringify(sentEmails));
    } catch (e) {
        console.error('Error saving sent emails:', e);
    }
}

function getSentEmailKey(sid, firstName, lastName, block, thresholdLevel) {
    // Prefer SID if available, fallback to name-based key
    if (sid) {
        return `sid:${sid}|${block}|${thresholdLevel}`;
    }
    return `name:${firstName}|${lastName}|${block}|${thresholdLevel}`.toLowerCase();
}

function isEmailSent(sid, firstName, lastName, block, thresholdLevel) {
    const key = getSentEmailKey(sid, firstName, lastName, block, thresholdLevel);
    return sentEmails[key] != null;
}

function getEmailSentDate(sid, firstName, lastName, block, thresholdLevel) {
    const key = getSentEmailKey(sid, firstName, lastName, block, thresholdLevel);
    const data = sentEmails[key];
    return data ? data.dateSent : null;
}

function markEmailAsSent(sid, firstName, lastName, block, thresholdLevel, courseName) {
    const key = getSentEmailKey(sid, firstName, lastName, block, thresholdLevel);
    sentEmails[key] = {
        dateSent: new Date().toISOString(),
        courseName: courseName || 'Unknown Course',
        block: block,
        thresholdLevel: thresholdLevel
    };
    saveSentEmails();
}

function formatSentDate(isoDate) {
    if (!isoDate) return 'sent';
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSentDateFull(isoDate) {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function getAllSentEmailsForStudent(sid, firstName, lastName) {
    // Get all sent emails for a specific student
    const emails = [];
    const sidPrefix = sid ? `sid:${sid}|` : null;
    const namePrefix = `name:${firstName}|${lastName}|`.toLowerCase();
    
    Object.keys(sentEmails).forEach(key => {
        const matchesSid = sidPrefix && key.startsWith(sidPrefix);
        const matchesName = key.startsWith(namePrefix);
        
        if (matchesSid || matchesName) {
            const data = sentEmails[key];
            if (data) {
                emails.push({
                    courseName: data.courseName || 'Unknown',
                    thresholdLevel: data.thresholdLevel || parseInt(key.split('|').pop()) || 6,
                    dateSent: data.dateSent,
                    block: data.block || parseInt(key.split('|')[1]) || 0
                });
            }
        }
    });
    
    // Sort by date (most recent first)
    emails.sort((a, b) => {
        if (!a.dateSent) return 1;
        if (!b.dateSent) return -1;
        return new Date(b.dateSent) - new Date(a.dateSent);
    });
    
    return emails;
}

// ===================================
// Thresholds Snapshot (for detecting new thresholds)
// ===================================
let thresholdsSnapshot = {}; // { "sid:123" or "name:first|last": { 1: 6, 3: 8 } } - block -> highest threshold level

function loadThresholdsSnapshot() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.STUDENT_THRESHOLDS_SNAPSHOT);
        thresholdsSnapshot = saved ? JSON.parse(saved) : {};
    } catch (e) {
        thresholdsSnapshot = {};
    }
}

function saveThresholdsSnapshot() {
    try {
        localStorage.setItem(STORAGE_KEYS.STUDENT_THRESHOLDS_SNAPSHOT, JSON.stringify(thresholdsSnapshot));
    } catch (e) {
        console.error('Error saving thresholds snapshot:', e);
    }
}

function getSnapshotKey(sid, firstName, lastName) {
    if (sid) return `sid:${sid}`;
    return `name:${firstName}|${lastName}`.toLowerCase();
}

function getLastKnownThreshold(sid, firstName, lastName, block) {
    const key = getSnapshotKey(sid, firstName, lastName);
    const studentSnapshot = thresholdsSnapshot[key];
    return studentSnapshot ? (studentSnapshot[block] || 0) : 0;
}

function updateThresholdsSnapshot(sid, firstName, lastName, block, thresholdLevel) {
    const key = getSnapshotKey(sid, firstName, lastName);
    if (!thresholdsSnapshot[key]) {
        thresholdsSnapshot[key] = {};
    }
    // Only update if the new threshold is higher
    if (!thresholdsSnapshot[key][block] || thresholdLevel > thresholdsSnapshot[key][block]) {
        thresholdsSnapshot[key][block] = thresholdLevel;
    }
    saveThresholdsSnapshot();
}

function isNewThreshold(sid, firstName, lastName, block, currentThresholdLevel) {
    // A threshold is "new" if:
    // 1. The current threshold level is higher than what we last saw
    // 2. AND the email for this threshold has not been sent
    const lastKnown = getLastKnownThreshold(sid, firstName, lastName, block);
    const emailSent = isEmailSent(sid, firstName, lastName, block, currentThresholdLevel);
    
    // It's new if current > lastKnown, OR if current >= lastKnown but email not sent
    return !emailSent && currentThresholdLevel >= 6; // Any unsent threshold needs attention
}

// ===================================
// Mail Merge Functions
// ===================================
function buildStudentEmailData(studentData, blockId) {
    // Build comprehensive data for a specific student for email generation
    if (allData.length === 0 || enrollmentData.length === 0) {
        return null;
    }
    
    const sid = studentData.sid || null;
    const firstName = studentData.firstName;
    const lastName = studentData.lastName;
    const grade = studentData.grade;
    const passedCourseName = studentData.courseName || ''; // Course name passed from threshold cell
    
    // Get student email and parent emails from attendance data
    let studentEmail = '';
    let parentEmails = [];
    
    // Find the first matching attendance record to get email fields (using SID or name)
    const attendanceRecord = allData.find(row => {
        // Try SID match first
        if (sid) {
            const rowSid = extractSID(row['Student_First Student_Last - SID'] || '');
            if (rowSid === sid) return true;
        }
        // Fallback to name match
        const stFirst = (row.Student_First || '').trim().toLowerCase();
        const stLast = (row.Student_Last || '').trim().toLowerCase();
        return stFirst === firstName.toLowerCase() && stLast === lastName.toLowerCase();
    });
    
    if (attendanceRecord) {
        studentEmail = (attendanceRecord.Student_Email || '').trim();
        // Parent emails are comma-separated
        const parentEmailStr = attendanceRecord['Parent Email'] || '';
        parentEmails = parentEmailStr.split(',').map(e => e.trim()).filter(e => e);
    }
    
    // Get advisor, grade dean, and teacher email from enrollment data
    let advisorEmails = [];
    let gradeDean = '';
    let teacherEmail = '';
    
    // Find enrollment record for this student using SID or name
    const enrollmentRecord = enrollmentData.find(row => {
        // Try SID match first
        if (sid) {
            const rowSid = extractSID(row['St_First St_Last - SID'] || '');
            if (rowSid === sid) return true;
        }
        // Fallback to name match
        const stFirst = (row.St_First || '').trim().toLowerCase();
        const stLast = (row.St_Last || '').trim().toLowerCase();
        return stFirst === firstName.toLowerCase() && stLast === lastName.toLowerCase();
    });
    
    if (enrollmentRecord) {
        // Advisors are comma-separated
        const advisorStr = enrollmentRecord.Advisors || '';
        advisorEmails = advisorStr.split(',').map(e => e.trim()).filter(e => e);
        gradeDean = (enrollmentRecord['Grade Dean'] || '').trim();
    }
    
    // Find the teacher email for the specific block using SID or name
    const blockEnrollment = enrollmentData.find(row => {
        const blockNum = extractBlockNumber(row.Block);
        if (blockNum !== blockId) return false;
        
        // Try SID match first
        if (sid) {
            const rowSid = extractSID(row['St_First St_Last - SID'] || '');
            if (rowSid === sid) return true;
        }
        // Fallback to name match
        const stFirst = (row.St_First || '').trim().toLowerCase();
        const stLast = (row.St_Last || '').trim().toLowerCase();
        return stFirst === firstName.toLowerCase() && stLast === lastName.toLowerCase();
    });
    
    if (blockEnrollment) {
        teacherEmail = (blockEnrollment.Teach_Email || '').trim();
    }
    
    // Build enrollment lookup for this student using SID or name
    const enrollmentLookup = {};
    enrollmentData.forEach(row => {
        // Check if this row is for our student (by SID or name)
        let isMatch = false;
        if (sid) {
            const rowSid = extractSID(row['St_First St_Last - SID'] || '');
            isMatch = rowSid === sid;
        }
        if (!isMatch) {
            const stFirst = (row.St_First || '').trim().toLowerCase();
            const stLast = (row.St_Last || '').trim().toLowerCase();
            isMatch = stFirst === firstName.toLowerCase() && stLast === lastName.toLowerCase();
        }
        
        if (isMatch) {
            const blockValue = row.Block || '';
            const blockNum = extractBlockNumber(blockValue);
            const courseTitle = row['Course Title'] || row.Course || '';
            const teacherName = `${row.Teach_First || ''} ${row.Teach_Last || ''}`.trim();
            
            if (blockNum) {
                enrollmentLookup[blockNum] = {
                    course: courseTitle,
                    teacher: teacherName,
                    isReducedSchedule: isReducedScheduleBlock(blockValue)
                };
            }
            
            // Also check for standalone SEL/DWI entries (block might just be "SEL" or "DWI")
            const blockUpper = blockValue.toUpperCase();
            const courseTitleUpper = courseTitle.toUpperCase();
            
            // Detect SEL courses
            if (courseTitleUpper.includes('SOCIAL EMOTIONAL') || 
                blockUpper === 'SEL' || 
                (blockUpper.includes('SEL') && !courseTitleUpper.includes('DESIGN'))) {
                enrollmentLookup['SEL'] = {
                    course: courseTitle,
                    teacher: teacherName,
                    isReducedSchedule: true
                };
            }
            
            // Detect DWI/DCI courses
            if (courseTitleUpper.includes('DESIGN WITH IMPACT') || 
                blockUpper === 'DWI' || blockUpper === 'DCI' ||
                blockUpper.includes('DWI') || blockUpper.includes('DCI')) {
                enrollmentLookup['DWI'] = {
                    course: courseTitle,
                    teacher: teacherName,
                    isReducedSchedule: true
                };
            }
        }
    });
    
    // Build attendance data for this student
    const blocks = {};
    for (let b = 1; b <= 8; b++) {
        blocks[b] = { absences: [], tardies: [], course: '', teacher: '', isReducedSchedule: false };
    }
    blocks['SEL'] = { absences: [], tardies: [], course: '', teacher: '', isReducedSchedule: true };
    blocks['DCI'] = { absences: [], tardies: [], course: '', teacher: '', isReducedSchedule: true };
    
    allData.forEach(row => {
        const stFirst = (row.Student_First || '').trim();
        const stLast = (row.Student_Last || '').trim();
        
        if (stFirst.toLowerCase() !== firstName.toLowerCase() || stLast.toLowerCase() !== lastName.toLowerCase()) {
            return;
        }
        
        const blockValue = row.Block || '';
        const blockNum = extractBlockNumber(blockValue);
        const date = row.Attendance_Date || '';
        const type = (row.Type || '').toLowerCase();
        const excuse = row.Excuse || '';
        
        if (!blockNum) return;
        
        // Determine block type - check course name from the row if available
        const courseName = (row.Course || '').toUpperCase();
        let blockType = blockNum;
        
        // Detect SEL vs DWI based on course title or block value
        const isSEL = courseName.includes('SOCIAL EMOTIONAL') || 
                      courseName.includes('SEL') ||
                      (blockValue.toUpperCase().includes('SEL') && !courseName.includes('DESIGN WITH IMPACT'));
        const isDWI = courseName.includes('DESIGN WITH IMPACT') || 
                      courseName.includes('DWI') ||
                      blockValue.toUpperCase().includes('DWI') || 
                      blockValue.toUpperCase().includes('DCI');
        
        if (isSEL) {
            blockType = 'SEL';
        } else if (isDWI) {
            blockType = 'DCI';
        }
        
        const formattedDate = formatDate(date);
        const isAbsence = type.includes('absence') || type.includes('absent');
        const isTardy = type.includes('tardy');
        
        if (isAbsence) {
            blocks[blockType].absences.push({ date: formattedDate, excuse });
        } else if (isTardy) {
            blocks[blockType].tardies.push({ date: formattedDate, excuse });
        }
    });
    
    // Enrich with enrollment data
    for (let b = 1; b <= 8; b++) {
        const enrollment = enrollmentLookup[b];
        if (enrollment) {
            blocks[b].isReducedSchedule = enrollment.isReducedSchedule;
            
            // If this block is SEL/DWI, store course/teacher in SEL/DCI blocks instead
            if (enrollment.isReducedSchedule) {
                // Check if it's SEL or DWI based on block info from enrollment
                const blockRow = enrollmentData.find(row => {
                    const stFirst = (row.St_First || '').trim().toLowerCase();
                    const stLast = (row.St_Last || '').trim().toLowerCase();
                    const blockNum = extractBlockNumber(row.Block);
                    return stFirst === firstName.toLowerCase() && 
                           stLast === lastName.toLowerCase() && 
                           blockNum === b;
                });
                
                if (blockRow) {
                    const blockValue = blockRow.Block || '';
                    const courseTitle = (enrollment.course || '').toUpperCase();
                    
                    // Detect SEL vs DWI based on course title or block value
                    const isSEL = courseTitle.includes('SOCIAL EMOTIONAL') || 
                                  courseTitle.includes('SEL') ||
                                  (blockValue.toUpperCase().includes('SEL') && !courseTitle.includes('DESIGN WITH IMPACT'));
                    const isDWI = courseTitle.includes('DESIGN WITH IMPACT') || 
                                  courseTitle.includes('DWI') ||
                                  blockValue.toUpperCase().includes('DWI') || 
                                  blockValue.toUpperCase().includes('DCI');
                    
                    if (isSEL) {
                        blocks['SEL'].course = enrollment.course;
                        blocks['SEL'].teacher = enrollment.teacher;
                    } else if (isDWI) {
                        blocks['DCI'].course = enrollment.course;
                        blocks['DCI'].teacher = enrollment.teacher;
                    }
                }
                
                // For the numbered block, we'll show "See SEL/DWI Below"
                blocks[b].course = enrollment.course;
                blocks[b].teacher = enrollment.teacher;
            } else {
                blocks[b].course = enrollment.course;
                blocks[b].teacher = enrollment.teacher;
            }
        }
        blocks[b].grandTotal = blocks[b].absences.length + Math.floor(blocks[b].tardies.length / 3);
    }
    // Also enrich SEL/DCI blocks from direct lookup if not already set
    if (enrollmentLookup['SEL'] && !blocks['SEL'].course) {
        blocks['SEL'].course = enrollmentLookup['SEL'].course;
        blocks['SEL'].teacher = enrollmentLookup['SEL'].teacher;
    }
    if (enrollmentLookup['DWI'] && !blocks['DCI'].course) {
        blocks['DCI'].course = enrollmentLookup['DWI'].course;
        blocks['DCI'].teacher = enrollmentLookup['DWI'].teacher;
    }
    
    blocks['SEL'].grandTotal = blocks['SEL'].absences.length + Math.floor(blocks['SEL'].tardies.length / 3);
    blocks['DCI'].grandTotal = blocks['DCI'].absences.length + Math.floor(blocks['DCI'].tardies.length / 3);
    
    // Determine threshold level for the specific block
    const targetBlock = blocks[blockId];
    let thresholdLevel = 6;
    if (targetBlock) {
        const count = targetBlock.absences.length;
        const isReduced = targetBlock.isReducedSchedule;
        
        if (isReduced) {
            if (count >= 5) thresholdLevel = 10;
            else if (count >= 4) thresholdLevel = 8;
            else thresholdLevel = 6;
        } else {
            if (count >= 10) thresholdLevel = 10;
            else if (count >= 8) thresholdLevel = 8;
            else thresholdLevel = 6;
        }
    }
    
    return {
        sid,
        firstName,
        lastName,
        grade,
        blocks,
        thresholdLevel,
        targetBlock: blockId,
        targetCourseName: passedCourseName, // Course name passed from threshold cell (most reliable)
        // Email recipients
        studentEmail,
        parentEmails,
        advisorEmails,
        gradeDean,
        teacherEmail
    };
}

function getTemplateForThreshold(thresholdLevel) {
    let templateKey;
    if (thresholdLevel >= 10) {
        templateKey = STORAGE_KEYS.EMAIL_TEMPLATE_10TH;
    } else if (thresholdLevel >= 8) {
        templateKey = STORAGE_KEYS.EMAIL_TEMPLATE_8TH;
    } else {
        templateKey = STORAGE_KEYS.EMAIL_TEMPLATE_6TH;
    }
    
    return localStorage.getItem(templateKey) || '';
}

function generateEmailForStudent(student) {
    const template = getTemplateForThreshold(student.thresholdLevel);
    
    if (!template) {
        return '<p style="color: #999;">No template found for this threshold level. Please add a template in the Email Templates section.</p>';
    }
    
    let email = template;
    
    // Helper function to replace placeholders (handles both regular and HTML-encoded versions)
    // Google Docs pastes << as &lt;&lt; and >> as &gt;&gt;
    function replacePlaceholder(text, placeholder, value) {
        // Regular version: <<placeholder>>
        const regexNormal = new RegExp(`<<${placeholder}>>`, 'gi');
        // HTML-encoded version: &lt;&lt;placeholder&gt;&gt;
        const regexEncoded = new RegExp(`&lt;&lt;${placeholder}&gt;&gt;`, 'gi');
        // Mixed versions (sometimes only one side is encoded)
        const regexMixed1 = new RegExp(`&lt;&lt;${placeholder}>>`, 'gi');
        const regexMixed2 = new RegExp(`<<${placeholder}&gt;&gt;`, 'gi');
        
        return text
            .replace(regexNormal, value)
            .replace(regexEncoded, value)
            .replace(regexMixed1, value)
            .replace(regexMixed2, value);
    }
    
    // Replace student name placeholders
    email = replacePlaceholder(email, 'Student First', student.firstName);
    email = replacePlaceholder(email, 'Student Last', student.lastName);
    email = replacePlaceholder(email, 'Student Name', `${student.firstName} ${student.lastName}`);
    email = replacePlaceholder(email, 'Grade', student.grade || '-');
    
    // Replace block-specific placeholders for blocks 1-8
    for (let b = 1; b <= 8; b++) {
        const block = student.blocks[b] || { absences: [], tardies: [], course: '', teacher: '', grandTotal: 0, isReducedSchedule: false };
        
        // Check if this block is SEL/DWI - if so, show "See SEL/DWI Below" and leave data empty
        if (block.isReducedSchedule) {
            // Course and teacher show redirect message
            email = replacePlaceholder(email, `Block ${b} Course`, 'See SEL/DWI Below');
            email = replacePlaceholder(email, `Block ${b} Teacher`, 'See SEL/DWI Below');
            
            // Leave data cells empty for SEL/DWI blocks (data is in SEL/DWI rows)
            email = replacePlaceholder(email, `Absence Dates B${b}`, '');
            email = replacePlaceholder(email, `Absences B${b}`, '');
            email = replacePlaceholder(email, `Tardy Dates B${b}`, '');
            email = replacePlaceholder(email, `Tardies B${b}`, '');
            email = replacePlaceholder(email, `Grand Total B${b}`, '');
        } else {
            // Regular block - show actual data
            email = replacePlaceholder(email, `Block ${b} Course`, block.course || '-');
            email = replacePlaceholder(email, `Block ${b} Teacher`, block.teacher || '-');
            
            // Absence info
            const absenceDates = block.absences.map(a => a.date).join(', ') || '';
            email = replacePlaceholder(email, `Absence Dates B${b}`, absenceDates);
            email = replacePlaceholder(email, `Absences B${b}`, block.absences.length > 0 ? block.absences.length.toString() : '');
            
            // Tardy info
            const tardyDates = block.tardies.map(t => t.date).join(', ') || '';
            email = replacePlaceholder(email, `Tardy Dates B${b}`, tardyDates);
            email = replacePlaceholder(email, `Tardies B${b}`, block.tardies.length > 0 ? block.tardies.length.toString() : '');
            
            // Grand total
            email = replacePlaceholder(email, `Grand Total B${b}`, block.grandTotal > 0 ? block.grandTotal.toString() : '');
        }
    }
    
    // Replace SEL placeholders
    const selBlock = student.blocks['SEL'] || { absences: [], tardies: [], course: '', teacher: '', grandTotal: 0 };
    email = replacePlaceholder(email, 'SEL Course', selBlock.course || '');
    email = replacePlaceholder(email, 'SEL Teacher', selBlock.teacher || '');
    email = replacePlaceholder(email, 'Absence Dates SEL', selBlock.absences.map(a => a.date).join(', ') || '');
    email = replacePlaceholder(email, 'Absences SEL', selBlock.absences.length > 0 ? selBlock.absences.length.toString() : '');
    email = replacePlaceholder(email, 'Tardy Dates SEL', selBlock.tardies.map(t => t.date).join(', ') || '');
    email = replacePlaceholder(email, 'Tardies SEL', selBlock.tardies.length > 0 ? selBlock.tardies.length.toString() : '');
    email = replacePlaceholder(email, 'Grand Total SEL', selBlock.grandTotal > 0 ? selBlock.grandTotal.toString() : '');
    
    // Replace DCI/DWI placeholders
    const dciBlock = student.blocks['DCI'] || { absences: [], tardies: [], course: '', teacher: '', grandTotal: 0 };
    email = replacePlaceholder(email, 'DWI Course', dciBlock.course || '');
    email = replacePlaceholder(email, 'DWI Teacher', dciBlock.teacher || '');
    email = replacePlaceholder(email, 'DCI Course', dciBlock.course || '');
    email = replacePlaceholder(email, 'DCI Teacher', dciBlock.teacher || '');
    email = replacePlaceholder(email, 'Absence Dates DWI', dciBlock.absences.map(a => a.date).join(', ') || '');
    email = replacePlaceholder(email, 'Absence Dates DCI', dciBlock.absences.map(a => a.date).join(', ') || '');
    email = replacePlaceholder(email, 'Absences DWI', dciBlock.absences.length > 0 ? dciBlock.absences.length.toString() : '');
    email = replacePlaceholder(email, 'Absences DCI', dciBlock.absences.length > 0 ? dciBlock.absences.length.toString() : '');
    email = replacePlaceholder(email, 'Tardy Dates DWI', dciBlock.tardies.map(t => t.date).join(', ') || '');
    email = replacePlaceholder(email, 'Tardy Dates DCI', dciBlock.tardies.map(t => t.date).join(', ') || '');
    email = replacePlaceholder(email, 'Tardies DWI', dciBlock.tardies.length > 0 ? dciBlock.tardies.length.toString() : '');
    email = replacePlaceholder(email, 'Tardies DCI', dciBlock.tardies.length > 0 ? dciBlock.tardies.length.toString() : '');
    email = replacePlaceholder(email, 'Grand Total DWI', dciBlock.grandTotal > 0 ? dciBlock.grandTotal.toString() : '');
    email = replacePlaceholder(email, 'Grand Total DCI', dciBlock.grandTotal > 0 ? dciBlock.grandTotal.toString() : '');
    
    return email;
}

function openEmailModalForStudent(studentData, blockId) {
    // Build full student data for email
    const student = buildStudentEmailData(studentData, blockId);
    if (!student) {
        alert('Unable to generate email. Please ensure data is imported.');
        return;
    }
    
    currentEmailStudent = student;
    currentEmailBlock = blockId;
    
    const modal = document.getElementById('emailModal');
    const modalStudentName = document.getElementById('modalStudentName');
    const emailTo = document.getElementById('emailTo');
    const emailCc = document.getElementById('emailCc');
    const emailBcc = document.getElementById('emailBcc');
    const emailPreviewBody = document.getElementById('emailPreviewBody');
    const btnMarkSent = document.getElementById('btnMarkSent');
    
    // Set student name in header
    modalStudentName.textContent = `${student.firstName} ${student.lastName} - Block ${blockId}`;
    
    // Set To field (student email)
    emailTo.textContent = student.studentEmail || '(no student email)';
    
    // Build CC list: parent emails + advisor emails + grade dean + teacher email
    const ccList = [];
    if (student.parentEmails && student.parentEmails.length > 0) {
        ccList.push(...student.parentEmails);
    }
    if (student.advisorEmails && student.advisorEmails.length > 0) {
        ccList.push(...student.advisorEmails);
    }
    if (student.gradeDean) {
        ccList.push(student.gradeDean);
    }
    if (student.teacherEmail) {
        ccList.push(student.teacherEmail);
    }
    emailCc.textContent = ccList.length > 0 ? ccList.join(', ') : '(none)';
    
    // Get BCC list based on threshold
    const bccList = getBccForThreshold(student.thresholdLevel);
    emailBcc.textContent = bccList.length > 0 ? bccList.join(', ') : '(none configured)';
    
    // Generate and display email content
    const emailContent = generateEmailForStudent(student);
    emailPreviewBody.innerHTML = emailContent;
    
    // Update Mark as Sent button state
    const alreadySent = isEmailSent(student.sid, student.firstName, student.lastName, blockId, student.thresholdLevel);
    const sentDate = getEmailSentDate(student.sid, student.firstName, student.lastName, blockId, student.thresholdLevel);
    if (alreadySent) {
        btnMarkSent.classList.add('already-sent');
        const sentDateStr = formatSentDate(sentDate);
        btnMarkSent.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Sent ${sentDateStr}
        `;
    } else {
        btnMarkSent.classList.remove('already-sent');
        btnMarkSent.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Mark as Sent
        `;
    }
    
    // Show modal
    modal.classList.remove('hidden');
}

function closeEmailModal() {
    const modal = document.getElementById('emailModal');
    modal.classList.add('hidden');
    currentEmailStudent = null;
    currentEmailBlock = null;
}

function markCurrentEmailAsSent() {
    if (!currentEmailStudent || !currentEmailBlock) return;
    
    const student = currentEmailStudent;
    const block = currentEmailBlock;
    
    // Get the course name - prefer the one passed from threshold cell, fallback to blocks data
    const blockData = student.blocks[block];
    const courseName = student.targetCourseName || (blockData ? blockData.course : '') || 'Unknown Course';
    
    // Mark as sent (with timestamp and course name)
    markEmailAsSent(student.sid, student.firstName, student.lastName, block, student.thresholdLevel, courseName);
    
    // Update the thresholds snapshot so this threshold is no longer "new"
    updateThresholdsSnapshot(student.sid, student.firstName, student.lastName, block, student.thresholdLevel);
    
    // Get the sent date for display
    const sentDate = getEmailSentDate(student.sid, student.firstName, student.lastName, block, student.thresholdLevel);
    const sentDateStr = formatSentDate(sentDate);
    
    // Update button state
    const btnMarkSent = document.getElementById('btnMarkSent');
    btnMarkSent.classList.add('already-sent');
    btnMarkSent.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Sent ${sentDateStr}
    `;
    
    // Update the badge in the thresholds table
    updateThresholdBadgeSentStatus(student.sid, student.firstName, student.lastName, block, student.thresholdLevel, sentDateStr);
    
    // Close modal after a brief delay
    setTimeout(() => {
        closeEmailModal();
        // Re-render the table to update the email history log and needs attention states
        renderThresholdsTable();
    }, 500);
}

function updateThresholdBadgeSentStatus(sid, firstName, lastName, block, thresholdLevel, sentDateStr) {
    // Find the corresponding badge and mark it as sent
    const rows = DOM.thresholdsTableBody.querySelectorAll('tr');
    rows.forEach(row => {
        // Match by SID if available, otherwise by name
        const rowSid = row.dataset.sid;
        const nameCell = row.querySelector('.student-name');
        const nameMatch = nameCell && nameCell.textContent.trim() === `${firstName} ${lastName}`;
        const sidMatch = sid && rowSid && rowSid === sid;
        
        if (sidMatch || (!sid && nameMatch)) {
            const cell = row.querySelector(`.threshold-cell[data-block="${block}"]`);
            if (cell) {
                // Update the current badge (the main one showing the count)
                const currentBadge = cell.querySelector('.threshold-badge.current-badge');
                if (currentBadge) {
                    currentBadge.classList.add('sent');
                    currentBadge.title = `Sent ${sentDateStr}`;
                }
                // Also update the button in the popup
                const btn = cell.querySelector('.btn-send-email');
                if (btn) {
                    btn.classList.add('sent');
                    btn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Sent ${sentDateStr}
                    `;
                }
            }
        }
    });
}

function getBccForThreshold(thresholdLevel) {
    let bccKey;
    if (thresholdLevel >= 10) {
        bccKey = STORAGE_KEYS.BCC_10TH;
    } else if (thresholdLevel >= 8) {
        bccKey = STORAGE_KEYS.BCC_8TH;
    } else {
        bccKey = STORAGE_KEYS.BCC_6TH;
    }
    const bccStr = localStorage.getItem(bccKey) || '';
    return bccStr.split(',').map(e => e.trim()).filter(e => e);
}

function processTablesForGmail(html) {
    // Create a temporary container to process the HTML
    const container = document.createElement('div');
    container.innerHTML = html;
    
    // Process all tables
    container.querySelectorAll('table').forEach(table => {
        // Table styles
        table.setAttribute('style', `
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
            font-family: Arial, sans-serif;
            font-size: 14px;
        `.replace(/\s+/g, ' ').trim());
        table.setAttribute('cellpadding', '0');
        table.setAttribute('cellspacing', '0');
        table.setAttribute('border', '1');
    });
    
    // Process all header cells
    container.querySelectorAll('th').forEach(th => {
        th.setAttribute('style', `
            background-color: #e0e0e0;
            border: 1px solid #000000;
            padding: 10px 12px;
            text-align: left;
            font-weight: bold;
            font-size: 14px;
            color: #000000;
        `.replace(/\s+/g, ' ').trim());
    });
    
    // Process all data cells
    container.querySelectorAll('td').forEach(td => {
        td.setAttribute('style', `
            border: 1px solid #000000;
            padding: 10px 12px;
            text-align: left;
            font-size: 14px;
            color: #000000;
            vertical-align: top;
        `.replace(/\s+/g, ' ').trim());
    });
    
    // Process header rows (first row in thead or first tr)
    container.querySelectorAll('thead tr, table > tr:first-child').forEach(tr => {
        tr.querySelectorAll('td, th').forEach(cell => {
            const existingStyle = cell.getAttribute('style') || '';
            cell.setAttribute('style', existingStyle + ' background-color: #e0e0e0; font-weight: bold;');
        });
    });
    
    return container.innerHTML;
}

function copyFormattedEmailToClipboard() {
    const emailPreviewBody = document.getElementById('emailPreviewBody');
    if (!emailPreviewBody) return Promise.resolve(false);
    
    // Process tables to add inline styles for Gmail compatibility
    const htmlContent = processTablesForGmail(emailPreviewBody.innerHTML);
    const plainText = emailPreviewBody.innerText;
    
    // Try to copy as rich text (HTML)
    if (navigator.clipboard && navigator.clipboard.write) {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        
        return navigator.clipboard.write([
            new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob
            })
        ]).then(() => true).catch(() => {
            // Fallback to plain text
            return navigator.clipboard.writeText(plainText).then(() => true).catch(() => false);
        });
    } else {
        // Fallback for older browsers
        return navigator.clipboard.writeText(plainText).then(() => true).catch(() => false);
    }
}

function showToast(message, duration = 3000) {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    // Remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function openInMailApp() {
    if (!currentEmailStudent) return;
    
    const student = currentEmailStudent;
    const subject = document.getElementById('emailSubject').value;
    const emailPreviewBody = document.getElementById('emailPreviewBody');
    
    // Build recipient lists
    const to = student.studentEmail || '';
    
    // CC: parent emails + advisor emails + grade dean + teacher email
    const ccList = [];
    if (student.parentEmails && student.parentEmails.length > 0) {
        ccList.push(...student.parentEmails);
    }
    if (student.advisorEmails && student.advisorEmails.length > 0) {
        ccList.push(...student.advisorEmails);
    }
    if (student.gradeDean) {
        ccList.push(student.gradeDean);
    }
    if (student.teacherEmail) {
        ccList.push(student.teacherEmail);
    }
    const cc = ccList.join(',');
    
    // BCC: static emails based on threshold
    const bccList = getBccForThreshold(student.thresholdLevel);
    const bcc = bccList.join(',');
    
    // Copy formatted email to clipboard first
    copyFormattedEmailToClipboard().then(success => {
        if (success) {
            showToast('📋 Formatted email copied! Paste (Cmd+V) into Gmail body.', 5000);
        }
    });
    
    // Build Gmail URL with recipients (body will be pasted by user)
    let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1`;
    gmailUrl += `&su=${encodeURIComponent(subject)}`;
    if (to) gmailUrl += `&to=${encodeURIComponent(to)}`;
    if (cc) gmailUrl += `&cc=${encodeURIComponent(cc)}`;
    if (bcc) gmailUrl += `&bcc=${encodeURIComponent(bcc)}`;
    
    // Open Gmail
    const newWindow = window.open(gmailUrl, '_blank');
    
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        // Popup was blocked
        showToast('⚠️ Popup blocked. Please allow popups for this site.', 5000);
    }
}

// ===================================
// Upload Section Setup
// ===================================
function setupUploadSection(sectionId, inputId, parseFunction) {
    const section = document.getElementById(sectionId);
    const input = document.getElementById(inputId);

    section.addEventListener('dragover', (e) => {
        e.preventDefault();
        section.classList.add('dragover');
    });

    section.addEventListener('dragleave', () => {
        section.classList.remove('dragover');
    });

    section.addEventListener('drop', (e) => {
        e.preventDefault();
        section.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            parseFunction(file);
        }
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) parseFunction(file);
    });
}

// ===================================
// Event Listeners Setup
// ===================================
function setupEventListeners() {
    // Navigation
    const navLinks = document.querySelectorAll('.nav-link');
    const pageViews = document.querySelectorAll('.page-view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.dataset.page;
            
            // Update active nav link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Show target page
            pageViews.forEach(page => page.classList.remove('active'));
            document.getElementById(targetPage + 'Page').classList.add('active');
            
            // If navigating to thresholds, render the table
            if (targetPage === 'thresholds') {
                renderThresholdsTable();
            }
        });
    });

    // Upload Sections - Drag and Drop
    setupUploadSection('uploadSectionAttendance', 'csvFileAttendance', parseAttendanceCSV);
    setupUploadSection('uploadSectionEnrollments', 'csvFileEnrollments', parseEnrollmentsCSV);

    // Filter Buttons
    document.getElementById('btnApply').addEventListener('click', applyFilters);
    document.getElementById('btnClear').addEventListener('click', clearFilters);
    
    // Search Input
    let searchDebounceTimer;
    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('input', (e) => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                performSearch(e.target.value);
            }, 200);
        });
        
        // Clear search on escape key
        DOM.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearSearch();
                DOM.searchInput.blur();
            }
        });
    }
    
    // Search Clear Button
    if (DOM.searchClear) {
        DOM.searchClear.addEventListener('click', () => {
            clearSearch();
            DOM.searchInput.focus();
        });
    }

    // Table Column Sorting
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            sortData(th.dataset.sort);
        });
    });
    
    // Pagination Controls - Top
    const prevButtonTop = document.querySelector('.pagination-prev-top');
    const nextButtonTop = document.querySelector('.pagination-next-top');
    if (prevButtonTop) {
        prevButtonTop.addEventListener('click', goToPreviousPage);
    }
    if (nextButtonTop) {
        nextButtonTop.addEventListener('click', goToNextPage);
    }
    
    // Pagination Controls - Bottom
    const prevButtonBottom = document.querySelector('.pagination-prev-bottom');
    const nextButtonBottom = document.querySelector('.pagination-next-bottom');
    if (prevButtonBottom) {
        prevButtonBottom.addEventListener('click', goToPreviousPage);
    }
    if (nextButtonBottom) {
        nextButtonBottom.addEventListener('click', goToNextPage);
    }
    
    // Table View Tabs (Data page)
    const tableTabs = document.querySelectorAll('.table-tab[data-table]');
    const tableViews = document.querySelectorAll('.table-view');
    
    tableTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTable = tab.dataset.table;
            
            // Update active tab
            tableTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show target view
            tableViews.forEach(view => view.classList.remove('active'));
            if (targetTable === 'attendance') {
                document.getElementById('attendanceView').classList.add('active');
            } else if (targetTable === 'enrollments') {
                document.getElementById('enrollmentsView').classList.add('active');
            }
        });
    });
    
    // Threshold View Tabs (Thresholds page)
    const thresholdTabs = document.querySelectorAll('.table-tab[data-threshold-view]');
    const thresholdViews = document.querySelectorAll('.threshold-view');
    
    thresholdTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetView = tab.dataset.thresholdView;
            
            // Update active tab
            thresholdTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show target view
            thresholdViews.forEach(view => view.classList.remove('active'));
            if (targetView === 'attention') {
                document.getElementById('attentionView').classList.add('active');
            } else if (targetView === 'history') {
                document.getElementById('historyView').classList.add('active');
            }
        });
    });
    
    // Enrollments Table Column Sorting
    document.querySelectorAll('th[data-sort-enrollments]').forEach(th => {
        th.addEventListener('click', () => {
            sortEnrollments(th.dataset.sortEnrollments);
        });
    });
    
    // Enrollments Pagination Controls - Top
    const prevButtonTopEnrollments = document.querySelector('.pagination-prev-top-enrollments');
    const nextButtonTopEnrollments = document.querySelector('.pagination-next-top-enrollments');
    if (prevButtonTopEnrollments) {
        prevButtonTopEnrollments.addEventListener('click', goToPreviousEnrollmentsPage);
    }
    if (nextButtonTopEnrollments) {
        nextButtonTopEnrollments.addEventListener('click', goToNextEnrollmentsPage);
    }
    
    // Enrollments Pagination Controls - Bottom
    const prevButtonBottomEnrollments = document.querySelector('.pagination-prev-bottom-enrollments');
    const nextButtonBottomEnrollments = document.querySelector('.pagination-next-bottom-enrollments');
    if (prevButtonBottomEnrollments) {
        prevButtonBottomEnrollments.addEventListener('click', goToPreviousEnrollmentsPage);
    }
    if (nextButtonBottomEnrollments) {
        nextButtonBottomEnrollments.addEventListener('click', goToNextEnrollmentsPage);
    }
    
    // Enrollments Search Input
    let enrollmentsSearchDebounceTimer;
    if (DOM.enrollmentsSearchInput) {
        DOM.enrollmentsSearchInput.addEventListener('input', (e) => {
            clearTimeout(enrollmentsSearchDebounceTimer);
            enrollmentsSearchDebounceTimer = setTimeout(() => {
                performEnrollmentsSearch(e.target.value);
            }, 200);
        });
        
        DOM.enrollmentsSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearEnrollmentsSearch();
                DOM.enrollmentsSearchInput.blur();
            }
        });
    }
    
    // Enrollments Search Clear Button
    if (DOM.enrollmentsSearchClear) {
        DOM.enrollmentsSearchClear.addEventListener('click', () => {
            clearEnrollmentsSearch();
            DOM.enrollmentsSearchInput.focus();
        });
    }
    
    // Close threshold details when clicking outside (or on empty cells)
    document.addEventListener('click', (e) => {
        const clickedCell = e.target.closest('.threshold-cell');
        // Close if clicking outside threshold cells OR clicking on an empty cell
        if (!clickedCell || clickedCell.classList.contains('empty')) {
            document.querySelectorAll('.threshold-cell.expanded').forEach(cell => {
                cell.classList.remove('expanded');
                const details = cell.querySelector('.threshold-details');
                if (details) {
                    details.style.left = '';
                    details.style.top = '';
                }
            });
        }
    });
    
    // Close threshold details when scrolling
    window.addEventListener('scroll', () => {
        document.querySelectorAll('.threshold-cell.expanded').forEach(cell => {
            cell.classList.remove('expanded');
            const details = cell.querySelector('.threshold-details');
            if (details) {
                details.style.left = '';
                details.style.top = '';
            }
        });
    }, { passive: true });
    
    // Toggle email history dropdown when clicking expand arrow or student name
    document.addEventListener('click', (e) => {
        const nameRow = e.target.closest('.student-name-row');
        if (nameRow) {
            const nameCell = nameRow.closest('.student-name-cell');
            if (nameCell && nameCell.classList.contains('has-history')) {
                e.stopPropagation();
                nameCell.classList.toggle('expanded');
            }
        }
    });
    
    // Grade Tabs for Email Templates
    const gradeTabs = document.querySelectorAll('.grade-tab');
    const gradeViews = document.querySelectorAll('.grade-view');
    
    gradeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetGrade = tab.dataset.grade;
            
            // Update active tab
            gradeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show target view
            gradeViews.forEach(view => view.classList.remove('active'));
            document.getElementById(`grade${targetGrade}View`).classList.add('active');
        });
    });
    
    // Email Template Editors - Auto-save
    setupTemplateEditor('6th');
    setupTemplateEditor('8th');
    setupTemplateEditor('10th');
    
    // Copy Template Buttons
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
            const grade = btn.dataset.template;
            copyTemplateToClipboard(grade);
        });
    });
    
    // BCC Configuration Fields - Load and auto-save
    setupBccField('bcc6th', STORAGE_KEYS.BCC_6TH, 'tstewart@nuevaschool.org');
    setupBccField('bcc8th', STORAGE_KEYS.BCC_8TH, 'tstewart@nuevaschool.org');
    setupBccField('bcc10th', STORAGE_KEYS.BCC_10TH, 'tstewart@nuevaschool.org');
    
    // Email Modal Events
    const modalClose = document.getElementById('modalClose');
    const emailModal = document.getElementById('emailModal');
    const btnOpenMail = document.getElementById('btnOpenMail');
    const btnMarkSent = document.getElementById('btnMarkSent');
    
    if (modalClose) {
        modalClose.addEventListener('click', closeEmailModal);
    }
    
    if (emailModal) {
        emailModal.addEventListener('click', (e) => {
            if (e.target === emailModal) {
                closeEmailModal();
            }
        });
    }
    
    if (btnOpenMail) {
        btnOpenMail.addEventListener('click', openInMailApp);
    }
    
    if (btnMarkSent) {
        btnMarkSent.addEventListener('click', markCurrentEmailAsSent);
    }
    
    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('emailModal');
            if (modal && !modal.classList.contains('hidden')) {
                closeEmailModal();
            }
        }
    });
}

// ===================================
// Application Initialization
// ===================================
window.addEventListener('DOMContentLoaded', async () => {
    cacheDOM();
    loadSentEmails(); // Load sent email tracking
    loadThresholdsSnapshot(); // Load last known thresholds
    try {
        await initIndexedDB();
        await loadSavedData();
        setupEventListeners();
    } catch (error) {
        console.error('Error initializing:', error);
        // Try to load data anyway (might still work with localStorage)
        await loadSavedData();
        setupEventListeners();
    }
    
    // Settings dropdown toggle
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsDropdown = document.getElementById('settingsDropdown');
    const clearDataBtn = document.getElementById('clearDataBtn');
    const clearDataModal = document.getElementById('clearDataModal');
    const clearModalClose = document.getElementById('clearModalClose');
    const clearDataCancel = document.getElementById('clearDataCancel');
    const clearDataConfirm = document.getElementById('clearDataConfirm');

    settingsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        settingsDropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!settingsDropdown.contains(e.target) && e.target !== settingsBtn) {
            settingsDropdown.classList.add('hidden');
        }
    });

    // Show confirmation modal
    clearDataBtn.addEventListener('click', function() {
        settingsDropdown.classList.add('hidden');
        clearDataModal.classList.remove('hidden');
    });

    // Close modal handlers
    clearModalClose.addEventListener('click', function() {
        clearDataModal.classList.add('hidden');
    });

    clearDataCancel.addEventListener('click', function() {
        clearDataModal.classList.add('hidden');
    });

    // Clear all data (preserve templates)
    clearDataConfirm.addEventListener('click', function() {
        // Save templates before clearing
        const template6th = localStorage.getItem(STORAGE_KEYS.EMAIL_TEMPLATE_6TH);
        const template8th = localStorage.getItem(STORAGE_KEYS.EMAIL_TEMPLATE_8TH);
        const template10th = localStorage.getItem(STORAGE_KEYS.EMAIL_TEMPLATE_10TH);

        localStorage.clear();

        // Restore templates
        if (template6th) localStorage.setItem(STORAGE_KEYS.EMAIL_TEMPLATE_6TH, template6th);
        if (template8th) localStorage.setItem(STORAGE_KEYS.EMAIL_TEMPLATE_8TH, template8th);
        if (template10th) localStorage.setItem(STORAGE_KEYS.EMAIL_TEMPLATE_10TH, template10th);
        
        clearDataModal.classList.add('hidden');
        location.reload();
    });

    // Close modal on overlay click
    clearDataModal.addEventListener('click', function(e) {
        if (e.target === clearDataModal) {
            clearDataModal.classList.add('hidden');
        }
    });
});

