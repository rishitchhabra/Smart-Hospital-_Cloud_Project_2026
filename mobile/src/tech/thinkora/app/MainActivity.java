package tech.thinkora.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

/**
 * Thin WebView shell that loads https://thinkora.tech and behaves like an app.
 *
 * - JavaScript, DOM storage and cookies enabled (auth sessions persist)
 * - Links inside thinkora.tech stay in-app; other links / mailto / tel / intent
 *   open in the system browser
 * - target="_blank" links are handled in-place
 * - Hardware back button navigates the web history
 * - Keyboard resizes the layout (adjustResize) so forms stay visible
 * - Top progress bar and a friendly offline page
 * - Notch / gesture-bar safe areas handled on the web side (viewport-fit=cover)
 */
public class MainActivity extends Activity {

    private static final String HOME_URL = "https://thinkora.tech";
    private static final String HOST = "thinkora.tech";

    private WebView webView;
    private ProgressBar progress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgress(0);
        root.addView(progress, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 7));

        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportMultipleWindows(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUri(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    progress.setVisibility(View.GONE);
                    view.loadDataWithBaseURL(null, offlineHtml(), "text/html", "utf-8", null);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            // Handle target="_blank" / window.open without leaving the app.
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                WebView.HitTestResult result = view.getHitTestResult();
                String url = result != null ? result.getExtra() : null;
                if (url != null) {
                    handleUri(Uri.parse(url));
                }
                return true;
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    /** Keep thinkora.tech in-app, hand everything else to the system. */
    private boolean handleUri(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if (("http".equals(scheme) || "https".equals(scheme)) && host != null && host.endsWith(HOST)) {
            return false; // in-app
        }
        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // No handler for this link — stay put.
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private String offlineHtml() {
        return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>"
                + "<style>body{font-family:-apple-system,Roboto,sans-serif;background:#f1f5f9;color:#0f172a;"
                + "display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}"
                + ".mark{width:64px;height:64px;border-radius:18px;background:#0F766E;color:#fff;font-size:34px;"
                + "display:flex;align-items:center;justify-content:center;margin-bottom:16px}"
                + "button{margin-top:20px;background:#0F766E;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:16px}"
                + "p{color:#64748b;max-width:320px}</style></head><body>"
                + "<div class='mark'>&#10084;</div><h2>You're offline</h2>"
                + "<p>Thinkora needs an internet connection. Check your network and try again.</p>"
                + "<button onclick=\"location.href='" + HOME_URL + "'\">Retry</button>"
                + "</body></html>";
    }
}
