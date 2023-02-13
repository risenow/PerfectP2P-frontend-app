/**
 * Inserts copyable Eth address element
 * @param {HTMLElement} parent
 * @param {string} address Ethereum address
 * @param {string} semantic adds to id
 * @param {*} uniq unique id to distinguish elements
 * @returns
 */
export function insertCopyableAddressElement(parent, address, semantic, uniq) {
  const template = document.querySelector(
    "#copyable-address-element-ejs-template"
  ).innerHTML;

  parent.insertAdjacentHTML(
    "afterbegin",
    ejs.compile(template)({
      address: address,
      semantic: semantic,
      uniq: uniq,
      shortAddress: "0x.." + address.substring(37, 37 + 5),
    })
  );
  const tipEl = document.getElementById(
    `${uniq}-${address}-${semantic}-address-copy-tip`
  );

  const copyButton = document.getElementById(
    `${uniq}-${address}-${semantic}-address-copy-button`
  );

  copyButton.onclick = function () {
    navigator.clipboard.writeText(address);

    tipEl.textContent = "Copied!";
    setTimeout(() => {
      tipEl.textContent = "Copy";
    }, 2500);
  };
}

//export let CustomElements;
//CustomElements.insertCopyableAddressElement = insertCopyableAddressElement;
