import { Box, Container, Typography, IconButton, Link } from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import TwitterIcon from '@mui/icons-material/Twitter';

/**
 * Footer component with contact information and social media links
 */
export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
        py: { xs: 2, sm: 3 },
        px: { xs: 2, sm: 3 },
        backgroundColor: '#151b2d',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: { xs: 1.5, sm: 2 },
          }}
        >
          {/* Copyright and site name */}
          <Typography 
            variant="body2" 
            sx={{ 
              color: '#ffffff',
              textAlign: { xs: 'center', sm: 'left' },
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
            }}
          >
            © {new Date().getFullYear()} Second Level Analytics. All rights reserved.
          </Typography>

          {/* Contact and Social Links */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 1.5, sm: 1 },
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Link
              href="mailto:contact@secondlevelanalytics.com"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: '#ffffff',
                textDecoration: 'none',
                '&:hover': {
                  color: '#42a5f5',
                },
              }}
            >
              <EmailIcon sx={{ fontSize: '20px' }} />
              <Typography 
                variant="body2" 
                sx={{ 
                  display: { xs: 'none', md: 'block' },
                  fontSize: { sm: '0.875rem' },
                }}
              >
                contact@secondlevelanalytics.com
              </Typography>
            </Link>

            <Box sx={{ display: 'flex', gap: { xs: 1, sm: 0.5 } }}>
              <IconButton
                component="a"
                href="https://twitter.com/secondleveldata"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                size="small"
                sx={{
                  color: '#ffffff',
                  padding: { xs: '10px', sm: '8px' },
                  '&:hover': {
                    color: '#1DA1F2',
                    backgroundColor: 'rgba(29, 161, 242, 0.1)',
                  },
                }}
              >
                <TwitterIcon sx={{ fontSize: '20px' }} />
              </IconButton>

              <IconButton
                component="a"
                href="https://bsky.app/profile/secondlevelanalytics.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="BlueSky"
                size="small"
                sx={{
                  color: '#ffffff',
                  padding: { xs: '10px', sm: '8px' },
                  '&:hover': {
                    color: '#1185fe',
                    backgroundColor: 'rgba(17, 133, 254, 0.1)',
                  },
                }}
              >
                {/* BlueSky butterfly logo, visually balanced with other icons */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 568 501"
                  width="20"
                  height="20"
                  fill="currentColor"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ display: 'block' }}
                >
                  <g transform="scale(0.85) translate(43, 30)">
                    <path d="M123.121 33.6637C188.241 82.5526 258.281 181.681 284 234.873C309.719 181.681 379.759 82.5526 444.879 33.6637C491.866 -1.61183 568 -28.9064 568 57.9464C568 75.2916 558.055 203.659 552.222 224.501C531.947 296.954 458.067 315.434 392.347 304.249C507.222 323.8 536.444 388.56 473.333 453.32C353.473 576.312 301.061 422.461 287.631 383.039C285.169 375.812 284.017 372.431 284 375.306C283.983 372.431 282.831 375.812 280.369 383.039C266.939 422.461 214.527 576.312 94.6667 453.32C31.5556 388.56 60.7778 323.8 175.653 304.249C109.933 315.434 36.0535 296.954 15.7778 224.501C9.94525 203.659 0 75.2916 0 57.9464C0 -28.9064 76.1345 -1.61183 123.121 33.6637Z"/>
                  </g>
                </svg>
              </IconButton>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
