export default function PageTrackingEnd() {
    const trackingGTAG = `\
    <!-- Google Tag Manager (noscript) -->\
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TVN3XKX2"\
    height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\
    <!-- End Google Tag Manager (noscript) -->`

    return (
        <>
        <div dangerouslySetInnerHTML={ {__html: trackingGTAG} }></div>
        </>
    );
}