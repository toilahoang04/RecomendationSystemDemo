// Biến toàn cục
let currentUser = null;
let productsData = null;
let currentCategory = null;
let selectedProduct = null;
let tfidfVectors = [];
let vocabulary = [];

// Hàm tải file JSON (chỉ đọc)
async function loadJSON(file) {
  const response = await fetch(file);
  return await response.json();
}

// Lưu và lấy dữ liệu từ LocalStorage
function saveToLocalStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function getFromLocalStorage(key) {
  return JSON.parse(localStorage.getItem(key));
}

// Đăng nhập
async function login() {
  const usernameInput = document.getElementById('username').value.trim().toLowerCase();
  const users = await loadJSON('users.json');
  const user = users.users.find(u => u.username.toLowerCase() === usernameInput);

  if (user) {
    currentUser = user;
    saveToLocalStorage('currentUser', currentUser);
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('home-content').classList.remove('hidden');
    loadHomePage();
  } else {
    alert('Tên đăng nhập không hợp lệ.');
  }
}

// Tải dữ liệu trang chủ
async function loadHomePage() {
  productsData = await loadJSON('products.json');

  // Xây dựng từ vựng và tính TF-IDF
  buildProductKeywords();
  vocabulary = buildVocabulary(productsData);
  const tf = computeTF(productsData, vocabulary);
  const idf = computeIDF(productsData, vocabulary);
  tfidfVectors = computeTFIDF(tf, idf);

  // Hiển thị sản phẩm gợi ý
  const recommendedProducts = getRecommendations();
  displayProducts(recommendedProducts, 'recommended-products');

  // Hiển thị sản phẩm nổi bật (random)
  const allProducts = productsData.categories.flatMap(c => c.products);
  const randomProducts = allProducts.sort(() => 0.5 - Math.random()).slice(0, 10);
  displayProducts(randomProducts, 'featured-products');
}

// Hiển thị sản phẩm
function displayProducts(products, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  products.forEach(product => {
    const productDiv = document.createElement('div');
    productDiv.className = 'product';
    productDiv.innerHTML = `
      <img src="${product.image}" alt="${product.name}">
      <h3>${product.name}</h3>
      <button onclick="viewProduct(${product.id})">Xem</button>
      <button onclick="buyProduct(${product.id})">Mua</button>
    `;
    container.appendChild(productDiv);
  });
}

// Xây dựng từ khóa cho sản phẩm
function buildProductKeywords() {
  productsData.categories.forEach(category => {
    category.products.forEach(product => {
      const keywords = [];
      // Tách từ từ tên sản phẩm, mô tả và danh mục
      const nameWords = product.name.toLowerCase().split(/\s+/);
      const descWords = product.description.toLowerCase().split(/\s+/);
      const categoryWords = category.name.toLowerCase().split(/\s+/);
      keywords.push(...nameWords, ...descWords, ...categoryWords);
      // Loại bỏ ký tự đặc biệt và số
      product.keywords = keywords.map(word => word.replace(/[^a-zA-Záàảãạâấầẩẫậăắằẳẵặđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/g, ''));
    });
  });
}

// Xây dựng từ vựng
function buildVocabulary(productsData) {
  const vocabSet = new Set();
  productsData.categories.forEach(category => {
    category.products.forEach(product => {
      product.keywords.forEach(keyword => {
        if (keyword) vocabSet.add(keyword);
      });
    });
  });
  return Array.from(vocabSet);
}

// Tính TF
function computeTF(productsData, vocabulary) {
  const tfArray = [];
  productsData.categories.forEach(category => {
    category.products.forEach(product => {
      const tf = {};
      vocabulary.forEach(term => {
        const termCount = product.keywords.filter(k => k === term).length;
        tf[term] = termCount / product.keywords.length;
      });
      tfArray.push(tf);
    });
  });
  return tfArray;
}

// Tính IDF
function computeIDF(productsData, vocabulary) {
  const idf = {};
  const totalDocs = productsData.categories.reduce((sum, category) => sum + category.products.length, 0);
  vocabulary.forEach(term => {
    let docsWithTerm = 0;
    productsData.categories.forEach(category => {
      category.products.forEach(product => {
        if (product.keywords.includes(term)) {
          docsWithTerm++;
        }
      });
    });
    idf[term] = Math.log10(totalDocs / (1 + docsWithTerm));
  });
  return idf;
}

// Tính TF-IDF
function computeTFIDF(tfArray, idf) {
  return tfArray.map(tf => {
    const tfidf = {};
    for (let term in tf) {
      tfidf[term] = tf[term] * idf[term];
    }
    return tfidf;
  });
}

// Tính Cosine Similarity
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let term in vecA) {
    dotProduct += (vecA[term] || 0) * (vecB[term] || 0);
    normA += (vecA[term] || 0) ** 2;
  }
  for (let term in vecB) {
    normB += (vecB[term] || 0) ** 2;
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

// Lấy sản phẩm gợi ý kết hợp Content-Based và Collaborative Filtering
function getRecommendations() {
  if (!currentUser) return [];

  // Lấy lịch sử tương tác của người dùng
  const userInteractions = getFromLocalStorage('userInteractions') || {};
  const interactedProductIds = userInteractions.views || [];

  // Tìm sản phẩm đề xuất từ Collaborative Filtering
  const collaborativeRecs = getCollaborativeRecommendations(currentUser, productsData);
  if (collaborativeRecs.length > 0) {
    return collaborativeRecs;
  } else {
    // Nếu không có đề xuất từ Collaborative Filtering, sử dụng Content-Based
    const contentBasedRecs = getContentBasedRecommendations(interactedProductIds, productsData, tfidfVectors);
    return contentBasedRecs;
  }
}

// Tìm sản phẩm đề xuất dựa trên Content-Based Filtering
function getContentBasedRecommendations(interactedProductIds, productsData, tfidfVectors) {
  if (interactedProductIds.length === 0) return [];

  // Lấy vector TF-IDF của các sản phẩm đã tương tác
  const interactedVectors = [];
  interactedProductIds.forEach(id => {
    const index = getProductIndexById(id);
    if (index !== -1) {
      interactedVectors.push(tfidfVectors[index]);
    }
  });

  // Tính điểm tương đồng cho tất cả sản phẩm
  const scores = [];
  tfidfVectors.forEach((vector, index) => {
    const productId = getProductIdByIndex(index);
    if (interactedProductIds.includes(productId)) return; // Bỏ qua sản phẩm đã tương tác

    let totalSimilarity = 0;
    interactedVectors.forEach(interactedVector => {
      totalSimilarity += cosineSimilarity(vector, interactedVector);
    });
    const avgSimilarity = totalSimilarity / interactedVectors.length;
    scores.push({ product: getProductByIndex(index), score: avgSimilarity });
  });

  // Sắp xếp sản phẩm theo điểm số giảm dần
  scores.sort((a, b) => b.score - a.score);

  // Trả về danh sách sản phẩm đề xuất
  return scores.map(item => item.product).slice(0, 10); // Lấy top 10 sản phẩm
}

// Tìm sản phẩm đề xuất dựa trên Collaborative Filtering
function getCollaborativeRecommendations(currentUser, productsData) {
  // Do không có dữ liệu từ nhiều người dùng khác, chúng ta sẽ sử dụng lịch sử tương tác của chính người dùng
  // hoặc giả lập dữ liệu nếu có
  return []; // Trả về mảng rỗng nếu không có dữ liệu
}

// Các hàm hỗ trợ
function getProductIndexById(productId) {
  let index = -1;
  let count = 0;
  for (const category of productsData.categories) {
    for (const product of category.products) {
      if (product.id === productId) {
        index = count;
        break;
      }
      count++;
    }
    if (index !== -1) break;
  }
  return index;
}

function getProductIdByIndex(index) {
  let count = 0;
  for (const category of productsData.categories) {
    for (const product of category.products) {
      if (count === index) {
        return product.id;
      }
      count++;
    }
  }
  return null;
}

function getProductByIndex(index) {
  let count = 0;
  for (const category of productsData.categories) {
    for (const product of category.products) {
      if (count === index) {
        return product;
      }
      count++;
    }
  }
  return null;
}

// Tìm sản phẩm theo ID
function findProductById(productId) {
  for (const category of productsData.categories) {
    const product = category.products.find(p => p.id === productId);
    if (product) return product;
  }
  return null;
}

// Xem sản phẩm
function viewProduct(productId) {
  selectedProduct = findProductById(productId);
  saveToLocalStorage('selectedProduct', selectedProduct);
  
  // Lưu lịch sử xem
  saveInteraction('views', productId);

  // Chuyển đến trang chi tiết sản phẩm
  window.location.href = 'product-detail.html';
}

// Mua sản phẩm
function buyProduct(productId) {
  const product = findProductById(productId);
  alert(`Bạn đã mua sản phẩm: ${product.name}`);

  // Lưu lịch sử mua
  saveInteraction('buys', productId);

  // Thêm sản phẩm vào danh sách đã mua trong localStorage
  addToPurchasedProductsLocal(productId);
}

// Thêm sản phẩm vào danh sách đã mua trong localStorage
function addToPurchasedProductsLocal(productId) {
  let purchasedProducts = getFromLocalStorage('purchasedProducts') || [];
  if (!purchasedProducts.includes(productId)) {
    purchasedProducts.push(productId);
    saveToLocalStorage('purchasedProducts', purchasedProducts);
  }
}

// Lưu lịch sử tương tác
function saveInteraction(type, data) {
  if (!currentUser) return;

  let userInteractions = getFromLocalStorage('userInteractions') || {};
  userInteractions[type] = userInteractions[type] || [];
  userInteractions[type].push(data);

  saveToLocalStorage('userInteractions', userInteractions);
}

// Chuyển đến trang chủ
function goToHome() {
  window.location.href = 'index.html';
}

// Chuyển đến trang danh mục
function goToCategory(categoryName) {
  saveToLocalStorage('selectedCategory', categoryName);
  window.location.href = 'products.html';
}

// Chuyển đến trang giỏ hàng
function goToCart() {
  window.location.href = 'cart.html';
}

// Hiển thị sản phẩm theo danh mục
async function loadCategoryPage() {
  productsData = await loadJSON('products.json');
  currentCategory = getFromLocalStorage('selectedCategory');

  const categoryTitle = document.getElementById('category-title');
  categoryTitle.textContent = currentCategory;

  const category = productsData.categories.find(c => c.name === currentCategory);
  if (category) {
    displayProducts(category.products, 'category-products');
  } else {
    document.getElementById('category-products').innerHTML = '<p>Không tìm thấy danh mục.</p>';
  }
}

// Tìm kiếm sản phẩm trên trang chủ
function searchProducts() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  if (!query) return;

  // Lưu lịch sử tìm kiếm
  saveInteraction('searches', query);

  const allProducts = productsData.categories.flatMap(c => c.products);
  const results = allProducts.filter(p =>
    p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query)
  );

  displayProducts(results, 'featured-products');
}

// Tìm kiếm sản phẩm trong danh mục
function searchCategoryProducts() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  if (!query) return;

  // Lưu lịch sử tìm kiếm
  saveInteraction('searches', query);

  const category = productsData.categories.find(c => c.name === currentCategory);
  if (category) {
    const results = category.products.filter(p =>
      p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query)
    );
    displayProducts(results, 'category-products');
  }
}

// Hiển thị chi tiết sản phẩm
function loadProductDetail() {
  selectedProduct = getFromLocalStorage('selectedProduct');
  if (!selectedProduct) {
    alert('Không tìm thấy sản phẩm.');
    return;
  }

  document.getElementById('product-image').src = selectedProduct.image;
  document.getElementById('product-name').textContent = selectedProduct.name;
  document.getElementById('product-description').textContent = selectedProduct.description;
}

// Đăng xuất
function logout() {
  // Xóa thông tin người dùng khỏi LocalStorage
  localStorage.removeItem('currentUser');
  localStorage.removeItem('userInteractions');
  localStorage.removeItem('purchasedProducts');
  // Chuyển hướng về trang đăng nhập
  window.location.href = 'index.html';
}

// Khởi tạo trang
window.onload = function() {
  const currentPage = window.location.pathname;

  if (currentPage.endsWith('index.html') || currentPage.endsWith('/')) {
    currentUser = getFromLocalStorage('currentUser');
    if (currentUser) {
      document.getElementById('login-section').classList.add('hidden');
      document.getElementById('home-content').classList.remove('hidden');
      loadHomePage();
    }
  } else if (currentPage.endsWith('products.html')) {
    loadCategoryPage();
  } else if (currentPage.endsWith('product-detail.html')) {
    loadProductDetail();
  } else if (currentPage.endsWith('cart.html')) {
    loadCartPage();
  }
};

// Tải trang giỏ hàng
async function loadCartPage() {
  currentUser = getFromLocalStorage('currentUser');
  if (!currentUser) {
    alert('Vui lòng đăng nhập để xem giỏ hàng.');
    window.location.href = 'index.html';
    return;
  }

  // Lấy danh sách sản phẩm đã mua từ localStorage
  const purchasedProductIds = getFromLocalStorage('purchasedProducts') || [];

  // Tải dữ liệu sản phẩm
  productsData = await loadJSON('products.json');

  // Lấy thông tin sản phẩm đã mua
  const purchasedProducts = [];
  purchasedProductIds.forEach(id => {
    const product = findProductById(id);
    if (product) purchasedProducts.push(product);
  });

  // Hiển thị sản phẩm đã mua
  displayPurchasedProducts(purchasedProducts);
}

// Hiển thị danh sách sản phẩm đã mua
function displayPurchasedProducts(products) {
  const container = document.getElementById('cart-products');
  container.innerHTML = '';

  if (products.length === 0) {
    container.innerHTML = '<p>Bạn chưa mua sản phẩm nào.</p>';
    return;
  }

  products.forEach(product => {
    const productDiv = document.createElement('div');
    productDiv.className = 'product';
    productDiv.innerHTML = `
      <img src="${product.image}" alt="${product.name}">
      <h3>${product.name}</h3>
      <button onclick="viewProduct(${product.id})">Xem</button>
    `;
    container.appendChild(productDiv);
  });
}
