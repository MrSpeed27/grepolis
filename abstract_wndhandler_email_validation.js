// inheritance:
(function() {
	'use strict';

	function AbstractWndHandlerEmailValidation(wndhandle){
		this.wnd = wndhandle;
	}
	AbstractWndHandlerEmailValidation.inherits(window.WndHandlerDefault);

//email
	AbstractWndHandlerEmailValidation.prototype.resendValidationEmail =  function() {
		//to display the email validation dialog set parameter validate
		this.wnd.requestContentPost('player', 'resend_validation_email', {validate: 1});
	};

	window.AbstractWndHandlerEmailValidation = AbstractWndHandlerEmailValidation;
}());
