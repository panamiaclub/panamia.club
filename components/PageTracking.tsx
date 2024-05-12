export default function PageTracking() {

    const trackingGTAG = "\
    <!-- Google tag (gtag.js) -->\
    <script async src='https://www.googletagmanager.com/gtag/js?id=AW-16508333106'>\
    </script>\
    <script>\
    window.dataLayer = window.dataLayer || [];\
    function gtag(){dataLayer.push(arguments);}\
    gtag('js', new Date());\
    gtag('config', 'AW-16508333106');\
    </script>"

    const trackingMetricool = "<script>function loadScript(a){var b=document.getElementsByTagName('head')[0],c=document.createElement('script');c.type='text/javascript',c.src='https://tracker.metricool.com/resources/be.js',c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:'22b37296cef855a47d27540f9aadd51'})});</script>";

    return (
        <>
        <div dangerouslySetInnerHTML={ {__html: trackingGTAG} }></div>
        <div dangerouslySetInnerHTML={ {__html: trackingMetricool} }></div>
        </>
    );
}