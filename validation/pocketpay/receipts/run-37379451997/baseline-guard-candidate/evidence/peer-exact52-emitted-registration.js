__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  }
  Object.defineProperty(exports, "server", {
    enumerable: true,
    get: function () {
      return server;
    }
  });
  Object.defineProperty(exports, "generateKeypair", {
    enumerable: true,
    get: function () {
      return generateKeypair;
    }
  });
  Object.defineProperty(exports, "fetchAccountDetails", {
    enumerable: true,
    get: function () {
      return fetchAccountDetails;
    }
  });
  Object.defineProperty(exports, "fetchXlmBalance", {
    enumerable: true,
    get: function () {
      return fetchXlmBalance;
    }
  });
  Object.defineProperty(exports, "fetchRecentTransactions", {
    enumerable: true,
    get: function () {
      return fetchRecentTransactions;
    }
  });
  Object.defineProperty(exports, "fetchTransactionsPage", {
    enumerable: true,
    get: function () {
      return fetchTransactionsPage;
    }
  });
  Object.defineProperty(exports, "fetchOperationById", {
    enumerable: true,
    get: function () {
      return fetchOperationById;
    }
  });
  Object.defineProperty(exports, "sendXlmTransaction", {
    enumerable: true,
    get: function () {
      return sendXlmTransaction;
    }
  });
  Object.defineProperty(exports, "fundWithFriendbot", {
    enumerable: true,
    get: function () {
      return fundWithFriendbot;
    }
  });
  Object.defineProperty(exports, "mockConnectVault", {
    enumerable: true,
    get: function () {
      return mockConnectVault;
    }
  });
  Object.defineProperty(exports, "mockFetchVaultBalance", {
    enumerable: true,
    get: function () {
      return mockFetchVaultBalance;
    }
  });
  Object.defineProperty(exports, "mockDepositToVault", {
    enumerable: true,
    get: function () {
      return mockDepositToVault;
    }
  });
  Object.defineProperty(exports, "mockFetchVaultMaturedLocks", {
    enumerable: true,
    get: function () {
      return mockFetchVaultMaturedLocks;
    }
  });
  Object.defineProperty(exports, "mockWithdrawFromVault", {
    enumerable: true,
    get: function () {
      return mockWithdrawFromVault;
    }
  });
  Object.defineProperty(exports, "getExplorerTxUrl", {
    enumerable: true,
    get: function () {
      return getExplorerTxUrl;
    }
  });
  Object.defineProperty(exports, "checkNetworkPassphrase", {
    enumerable: true,
    get: function () {
      return checkNetworkPassphrase;
    }
  });
  var _babelRuntimeHelpersAsyncToGenerator = require(_dependencyMap[0], "@babel/runtime/helpers/asyncToGenerator");
  var _asyncToGenerator = _interopDefault(_babelRuntimeHelpersAsyncToGenerator);
  var _expoVirtualEnv = require(_dependencyMap[1], "expo/virtual/env");
  var _stellarStellarSdk = require(_dependencyMap[2], "@stellar/stellar-sdk");
  var StellarSdk = _interopNamespace(_stellarStellarSdk);
  var _expoCrypto = require(_dependencyMap[3], "expo-crypto");
  var ExpoCrypto = _interopNamespace(_expoCrypto);
  var _buffer = require(_dependencyMap[4], "buffer");
  var server = new StellarSdk.Horizon.Server(_expoVirtualEnv.env.EXPO_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org');

  /** Horizon operation record type used for transaction history. */

  /**
   * Generates a new Stellar Keypair.
   * This function returns both the public and secret keys.
   * The secret key MUST be stored securely using SecureStore.
   */
  var generateKeypair = () => {
    var seed = ExpoCrypto.getRandomValues(new Uint8Array(32));
    var keypair = StellarSdk.Keypair.fromRawEd25519Seed(_buffer.Buffer.from(seed));
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret()
    };
  };

  /**
   * Horizon returns 404 for accounts that don't exist on the network yet
   * (i.e. never funded). The SDK surfaces this as a NotFoundError with the
   * message "Not Found", while our own wrapper throws "Account not found".
   */
  var isNotFoundError = error => error?.response?.status === 404 || /not found/i.test(error?.message || '');

  /**
   * Helper to fetch account details including balances.
   */
  var fetchAccountDetails = /*#__PURE__*/function () {
    var _ref = (0, _asyncToGenerator.default)(function* (publicKey) {
      try {
        var account = yield server.loadAccount(publicKey);
        return account;
      } catch (error) {
        if (error.response && error.response.status === 404) {
          throw new Error('Account not found on the network. Please fund it first.');
        }
        throw error;
      }
    });
    return function fetchAccountDetails(_x) {
      return _ref.apply(this, arguments);
    };
  }();

  /**
   * Fetch the XLM balance for a given public key.
   */
  var fetchXlmBalance = /*#__PURE__*/function () {
    var _ref2 = (0, _asyncToGenerator.default)(function* (publicKey) {
      try {
        var account = yield fetchAccountDetails(publicKey);
        var nativeBalance = account.balances.find(b => b.asset_type === 'native');
        return nativeBalance ? nativeBalance.balance : '0.0000000';
      } catch (error) {
        // If account is not found (unfunded), balance is 0
        if (isNotFoundError(error)) {
          return '0.0000000';
        }
        throw error;
      }
    });
    return function fetchXlmBalance(_x2) {
      return _ref2.apply(this, arguments);
    };
  }();

  /**
   * Fetch recent transactions for a given public key.
   */
  var fetchRecentTransactions = /*#__PURE__*/function () {
    var _ref3 = (0, _asyncToGenerator.default)(function* (publicKey) {
      var limit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 20;
      try {
        var response = yield server.operations().forAccount(publicKey).order('desc').limit(limit).call();
        return response.records;
      } catch (error) {
        if (isNotFoundError(error)) {
          return [];
        }
        console.error('Error fetching transactions:', error);
        throw error;
      }
    });
    return function fetchRecentTransactions(_x3) {
      return _ref3.apply(this, arguments);
    };
  }();
  /**
   * Fetch a page of operations for `publicKey`, ordered descending
   * (newest-first).  Supports cursor-based "load more older" pagination.
   *
   * @param publicKey  – Stellar public key to query.
   * @param limit      – Page size (default 20).
   * @param cursor     – Paging token from a previous page to continue from.
   *                    Pass `undefined` / omit to start from the latest.
   */
  var fetchTransactionsPage = /*#__PURE__*/function () {
    var _ref4 = (0, _asyncToGenerator.default)(function* (publicKey) {
      var limit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 20;
      var cursor = arguments.length > 2 ? arguments[2] : undefined;
      try {
        var builder = server.operations().forAccount(publicKey).order('desc').limit(limit);
        if (cursor) {
          builder = builder.cursor(cursor);
        }
        var response = yield builder.call();
        var records = response.records;
        var hasMore = records.length === limit;

        // The cursor for the next page is the paging_token of the last (oldest)
        // record returned.  Horizon uses paging_token as the cursor value.
        var nextCursor = hasMore && records.length > 0 ? records[records.length - 1].paging_token ?? null : null;
        return {
          records,
          nextCursor,
          hasMore
        };
      } catch (error) {
        if (error.message && error.message.includes('not found')) {
          return {
            records: [],
            nextCursor: null,
            hasMore: false
          };
        }
        console.error('Error fetching transactions page:', error);
        throw error;
      }
    });
    return function fetchTransactionsPage(_x4) {
      return _ref4.apply(this, arguments);
    };
  }();

  /**
   * Fetch a single operation by its Horizon ID.  Used by the transaction detail
   * screen when arriving via deep link — the operation may not be in the local
   * store yet.
   *
   * @param operationId  – Horizon operation ID (numeric string or paging token).
   * @returns The operation record, or `null` if not found on the network.
   */
  var fetchOperationById = /*#__PURE__*/function () {
    var _ref5 = (0, _asyncToGenerator.default)(function* (operationId) {
      try {
        var record = yield server.operations().operation(operationId).call();
        return record;
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }
        console.error('Error fetching operation by ID:', error);
        throw error;
      }
    });
    return function fetchOperationById(_x5) {
      return _ref5.apply(this, arguments);
    };
  }();

  /**
   * Send XLM to a destination address.
   */
  var sendXlmTransaction = /*#__PURE__*/function () {
    var _ref6 = (0, _asyncToGenerator.default)(function* (secretKey, destinationPublicKey, amount, memoText) {
      try {
        var sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
        var sourcePublicKey = sourceKeypair.publicKey();
        var account = yield server.loadAccount(sourcePublicKey);
        var fee = yield server.fetchBaseFee();
        var transactionBuilder = new StellarSdk.TransactionBuilder(account, {
          fee: fee.toString(),
          networkPassphrase: _expoVirtualEnv.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET
        });
        transactionBuilder.addOperation(StellarSdk.Operation.payment({
          destination: destinationPublicKey,
          asset: StellarSdk.Asset.native(),
          amount: amount
        }));
        if (memoText) {
          transactionBuilder.addMemo(StellarSdk.Memo.text(memoText));
        }
        transactionBuilder.setTimeout(30);
        var transaction = transactionBuilder.build();
        transaction.sign(sourceKeypair);
        var response = yield server.submitTransaction(transaction);
        return response;
      } catch (error) {
        console.error('Error sending transaction:', error?.response?.data || error);
        throw new Error(error?.response?.data?.extras?.result_codes?.transaction || 'Transaction failed');
      }
    });
    return function sendXlmTransaction(_x6, _x7, _x8, _x9) {
      return _ref6.apply(this, arguments);
    };
  }();
  var isAccountNotFoundError = error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ACCOUNT_NOT_FOUND';

  /**
   * Fund a Stellar testnet account using Friendbot.
   * Only works on testnet; throws on mainnet or if funding fails.
   */
  var fundWithFriendbot = /*#__PURE__*/function () {
    var _ref7 = (0, _asyncToGenerator.default)(function* (publicKey) {
      try {
        var url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
        var response = yield fetch(url);
        if (!response.ok) {
          throw new Error(`Friendbot error: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Friendbot funding failed:', error);
        throw new Error(error.message || 'Friendbot funding failed');
      }
    });
    return function fundWithFriendbot(_x0) {
      return _ref7.apply(this, arguments);
    };
  }();

  /**
   * MOCK SERVICE WRAPPERS FOR SOROBAN SAVINGS VAULT
   *
   * Used as a fallback by the vault store when EXPO_PUBLIC_VAULT_CONTRACT_ID
   * is not set. The real Soroban implementations live in ./vault.ts.
   */

  var mockConnectVault = /*#__PURE__*/function () {
    var _ref8 = (0, _asyncToGenerator.default)(function* (publicKey) {
      // Simulate network delay
      yield new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    });
    return function mockConnectVault(_x1) {
      return _ref8.apply(this, arguments);
    };
  }();
  var mockFetchVaultBalance = /*#__PURE__*/function () {
    var _ref9 = (0, _asyncToGenerator.default)(function* (publicKey) {
      yield new Promise(resolve => setTimeout(resolve, 500));
      return '0.0000000'; // Default placeholder
    });
    return function mockFetchVaultBalance(_x10) {
      return _ref9.apply(this, arguments);
    };
  }();
  var mockDepositToVault = /*#__PURE__*/function () {
    var _ref0 = (0, _asyncToGenerator.default)(function* (secretKey, amount) {
      yield new Promise(resolve => setTimeout(resolve, 1500));
      return true;
    });
    return function mockDepositToVault(_x11, _x12) {
      return _ref0.apply(this, arguments);
    };
  }();
  var mockFetchVaultMaturedLocks = /*#__PURE__*/function () {
    var _ref1 = (0, _asyncToGenerator.default)(function* (publicKey) {
      yield new Promise(resolve => setTimeout(resolve, 500));
      // Return mock matured locks for preview purposes
      return [{
        id: 'lock_a1b2c3d4e5f6',
        amount: '50.0000000',
        unlockedAt: new Date(Date.now() - 86400000 * 3).toISOString() // 3 days ago
      }, {
        id: 'lock_f6e5d4c3b2a1',
        amount: '25.5000000',
        unlockedAt: new Date(Date.now() - 86400000 * 7).toISOString() // 7 days ago
      }];
    });
    return function mockFetchVaultMaturedLocks(_x13) {
      return _ref1.apply(this, arguments);
    };
  }();
  var mockWithdrawFromVault = /*#__PURE__*/function () {
    var _ref10 = (0, _asyncToGenerator.default)(function* (secretKey, amount) {
      yield new Promise(resolve => setTimeout(resolve, 1500));
      return true;
    });
    return function mockWithdrawFromVault(_x14, _x15) {
      return _ref10.apply(this, arguments);
    };
  }();

  /**
   * Networks with a known stellar.expert explorer path. Anything else (e.g. a
   * custom standalone network) has no public explorer, so callers should treat
   * a `null` result as "no explorer link available".
   */
  var EXPLORER_NETWORK_PATHS = {
    TESTNET: 'testnet',
    PUBLIC: 'public',
    MAINNET: 'public'
  };

  /**
   * Builds a stellar.expert transaction URL for the network configured via
   * EXPO_PUBLIC_STELLAR_NETWORK (defaults to Testnet, matching this app's
   * default network). Returns null when there is no hash or no known explorer
   * for the configured network.
   */
  var getExplorerTxUrl = hash => {
    if (!hash) return null;
    var network = (_expoVirtualEnv.env.EXPO_PUBLIC_STELLAR_NETWORK || 'TESTNET').toUpperCase();
    var explorerNetwork = EXPLORER_NETWORK_PATHS[network];
    if (!explorerNetwork) return null;
    return `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}`;
  };

  /**
   * Checks if the connected Horizon server's network passphrase matches the expected passphrase.
   * Returns true if it matches, false if it doesn't match.
   * Throws if the server is unreachable.
   */
  var checkNetworkPassphrase = /*#__PURE__*/function () {
    var _ref11 = (0, _asyncToGenerator.default)(function* () {
      var root = yield server.root();
      var expectedPassphrase = _expoVirtualEnv.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET;
      return root.network_passphrase === expectedPassphrase;
    });
    return function checkNetworkPassphrase() {
      return _ref11.apply(this, arguments);
    };
  }();
},100,[101,102,103,104,105],"src/services/stellar.ts");
