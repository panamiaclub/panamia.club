export default function PageTracking() {

    const trackingGTAG = `<!-- Google Tag Manager -->\
    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\
    })(window,document,'script','dataLayer','GTM-TVN3XKX2');</script>\
    <!-- End Google Tag Manager -->`

    const trackingMetricool = "<script>function loadScript(a){var b=document.getElementsByTagName('head')[0],c=document.createElement('script');c.type='text/javascript',c.src='https://tracker.metricool.com/resources/be.js',c.onreadystatechange=a,c.onload=a,b.appendChild(c)}loadScript(function(){beTracker.t({hash:'22b37296cef855a47d27540f9aadd51'})});</script>";

    return (
        <>
        <div dangerouslySetInnerHTML={ {__html: trackingGTAG} }></div>
        <div dangerouslySetInnerHTML={ {__html: trackingMetricool} }></div>
        </>
    );
}